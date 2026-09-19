import { createArea as area, success, failure } from './helpers';
import type {
  Classifier,
  ClassificationRequest,
  StatsChanges,
  Rule,
  ContentAdapter,
} from '../src/types';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../src/shared/core';
import * as C from '../src/core/content';
import * as D from '../src/core/decision';
import { createRegistry, registry } from '../src/core/adapters';
import '../src/adapters/youtube';
import { createClassificationService } from '../src/services/classification';

async function serviceFixture(classifier: Classifier) {
  const runtime = { storage: { local: area(), session: area() } };
  await E.saveConfig(runtime, { typesafeApiKey: 'local-secret' });
  let statsGate = Promise.resolve();
  const writeStats = (changes: StatsChanges) => {
    const operation = statsGate.then(async () => {
      const stats = await E.getStats(runtime);
      for (const key of ['requests', 'cacheHits', 'errors', 'checked', 'hidden'] as const) {
        const delta = changes[`${key}Delta`];
        if (delta !== undefined) stats[key] += delta;
      }
      if (changes.lastError !== undefined) stats.lastError = changes.lastError;
      if (changes.latencyMs !== undefined) stats.latencyMs = changes.latencyMs;
      await E.updateStats(runtime, stats);
    });
    statsGate = operation.catch(() => {});
    return operation;
  };
  return {
    runtime,
    service: createClassificationService({ runtime, classifier, writeStats }),
    writeStats,
  };
}

const sample = (source = 'youtube', type = 'video', id = 'same-id') => ({
  source,
  type,
  id,
  title: '示例标题',
  author: '作者',
  text: '正文',
});
const scores = (rules: Rule[], value = 0.1) =>
  Object.fromEntries(rules.map((rule) => [rule.id, value]));

test('content contract is source-neutral, whitelists fields and separates identity from revision', () => {
  const a = sample();
  const normalized = C.normalizeContent({
    ...a,
    apiKey: 'secret',
    url: 'private-url',
    node: { unsafe: true },
  });
  assert.deepEqual(normalized, a);
  assert.equal(C.serializeContent(normalized).includes('same-id'), false);
  assert.notEqual(C.identity(a), C.identity(sample('sample-social', 'post')));
  assert.equal(C.identity(a), C.identity({ ...a, title: 'new title' }));
  assert.notEqual(C.revision(a), C.revision({ ...a, title: 'new title' }));
  for (const invalid of [
    null,
    {},
    { ...a, source: '../bad' },
    { ...a, id: '' },
    { ...a, title: {}, text: '' },
    { ...a, title: '', text: '' },
  ]) {
    assert.throws(() => C.normalizeContent(invalid), { code: 'INVALID_CONTENT' });
  }
});

test('long escaped content does not collide in cache after a shared prefix', async () => {
  const a = {
    ...sample(),
    title: '"'.repeat(1000),
    author: '"'.repeat(300),
    text: '"'.repeat(1999) + 'a',
  };
  const b = { ...a, text: '"'.repeat(1999) + 'b' };
  assert.ok(C.serializeContent(a).length > E.MAX_CONTENT_LENGTH);
  assert.notEqual(
    await E.cacheKey(C.serializeContent(a), E.DEFAULT_RULES),
    await E.cacheKey(C.serializeContent(b), E.DEFAULT_RULES)
  );
});

test('registry rejects incomplete, duplicate and ambiguous adapters without needing a DOM', () => {
  const registry = createRegistry();
  const contract: ContentAdapter = {
    id: 'example',
    matches: (url) => url === 'https://example.test/',
    getContext: () => null,
    collect: () => [],
    extract: () => null,
    isInScope: () => false,
  };
  assert.throws(() => registry.register({ id: 'bad' } as ContentAdapter), /missing/);
  registry.register(contract);
  assert.equal(registry.resolve('https://example.test/').id, 'example');
  assert.equal(registry.resolve('https://other.test/'), null);
  assert.throws(() => registry.register(contract), /Duplicate/);
  registry.register({ ...contract, id: 'overlap' });
  assert.throws(() => registry.resolve('https://example.test/'), /Ambiguous/);
});

test('manifest bundles only the registered YouTube adapter', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  assert.deepEqual(manifest.host_permissions, [
    'https://www.youtube.com/*',
    'https://api.typesafe.ai/*',
  ]);
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].js, ['src/content.js']);
  assert.equal(registry.list().length, 1);
  assert.equal(registry.resolve('https://www.youtube.com/').id, 'youtube');
  assert.equal(registry.resolve('https://x.com/home'), null);
});

test('a second source and a different classifier use the same service and local decisions', async () => {
  const calls: ClassificationRequest[] = [];
  const classifier: Classifier = {
    id: 'test-provider',
    async classify(request) {
      calls.push(request);
      return { scores: scores(request.rules, 0.95), latencyMs: 7 };
    },
  };
  const { service } = await serviceFixture(classifier);
  const first = await service.classify({ content: sample() });
  const second = await service.classify({ content: sample('example-social', 'post') });
  assert.equal(success(first).shouldHide, true);
  assert.equal(success(second).shouldHide, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].content.type, 'post');
  assert.equal(
    success(await service.classify({ content: sample('example-social', 'post', 'different-id') }))
      .cache,
    'hit'
  );
  assert.equal(calls.length, 2);
  assert.equal(
    D.decide({ custom: 0.7 }, [E.normalizeRule({ id: 'custom', threshold: 0.8, enabled: true })])
      .shouldHide,
    false
  );
});

test('provider identity partitions cached scores and malformed content never reaches a classifier', async () => {
  let calls = 0;
  const make = (id: string, value: number): Classifier => ({
    id,
    async classify({ rules }) {
      calls++;
      return { scores: scores(rules, value), latencyMs: 0 };
    },
  });
  const first = await serviceFixture(make('provider-one', 0.95));
  await first.service.classify({ content: sample() });
  const other = createClassificationService({
    runtime: first.runtime,
    writeStats: first.writeStats,
    classifier: make('provider-two', 0.1),
  });
  assert.equal(success(await other.classify({ content: sample() })).shouldHide, false);
  assert.equal(
    failure(await other.classify({ content: { source: 'youtube' } })).error,
    'INVALID_CONTENT'
  );
  assert.equal(calls, 2);
});

test('clearing cache while a request is in flight does not repopulate it with old results', async () => {
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const classifier: Classifier = {
    id: 'test-provider',
    async classify({ rules }) {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { scores: scores(rules), latencyMs: 1 };
    },
  };
  const { service, runtime } = await serviceFixture(classifier);
  const pending = service.classify({ content: sample() });
  await ready;
  await service.clearCache();
  release();
  await pending;
  assert.equal(runtime.storage.session.values[E.CACHE_KEY], undefined);
});

test('existing credentials, custom rules and disabled defaults survive the refactor', async () => {
  const { runtime } = await serviceFixture({
    id: 'test',
    async classify() {
      throw new Error('Not used');
    },
  });
  const rules = [
    ...E.DEFAULT_RULES.map((rule) => ({ ...rule, enabled: false })),
    E.normalizeRule({
      id: 'custom_politics',
      name: '政治',
      description: '隐藏选举争论',
      falseCriteria: '保留历史课程',
      threshold: 0.87,
    }),
  ];
  await E.saveConfig(runtime, { rules, enabled: false, dailyLimit: 321 });
  const saved = await E.loadConfig(runtime, true);
  assert.equal(saved.typesafeApiKey, 'local-secret');
  assert.equal(saved.enabled, false);
  assert.equal(saved.dailyLimit, 321);
  assert.equal(saved.rules.at(-1)?.falseCriteria, '保留历史课程');
  assert.equal(saved.rules.at(-1)?.threshold, 0.87);
  assert.equal(saved.rules.filter((rule) => rule.builtin && rule.enabled).length, 0);
});
