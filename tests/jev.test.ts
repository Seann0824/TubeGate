import type { Questions } from '../src/providers/jev-protocol';
import { record } from '../src/types';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/shared/core';
import JevClassifier from '../src/providers/jev';
const rules = [
  E.normalizeRule({
    id: 'custom',
    name: 'custom',
    enabled: true,
    threshold: 0.9,
    instructions: 'filter',
    trueCriteria: 'yes',
    falseCriteria: 'no',
  }),
];
const request = {
  apiKey: 'private-key',
  model: 'jev-latest',
  content: {
    source: 'example',
    id: 'local-only-id',
    type: 'post',
    title: '',
    author: 'writer',
    text: 'hello',
  },
  rules,
};

test('Jev returns neutral scores without deciding whether to hide content', async () => {
  let body!: { questions: Questions };
  const classifier = new JevClassifier({
    fetchImpl: async (url, options) => {
      assert.equal(url, E.API_ENDPOINT);
      assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer private-key');
      body = JSON.parse(String(options?.body));
      return Response.json({ answers: { custom: { pTrue: 0.8 } } });
    },
  });
  const result = await classifier.classify(request);
  assert.deepEqual(result.scores, { custom: 0.8 });
  assert.equal(record(result).shouldHide, undefined);
  assert.equal(body.questions.custom.criteria.false, 'no');
  assert.equal(JSON.stringify(body).includes('private-key'), false);
  assert.equal(JSON.stringify(body).includes('local-only-id'), false);
});

test('Jev failures are propagated without unbudgeted retries', async () => {
  for (const status of [401, 429, 500]) {
    let calls = 0;
    const classifier = new JevClassifier({
      fetchImpl: async () => {
        calls++;
        return new Response(null, { status });
      },
    });
    await assert.rejects(classifier.classify(request), { status });
    assert.equal(calls, 1);
  }
});

test('Jev times out and rejects malformed response probabilities', async () => {
  const slow = new JevClassifier({
    timeoutMs: 5,
    fetchImpl: (_, options) =>
      new Promise((_, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          { once: true }
        );
      }),
  });
  await assert.rejects(slow.classify(request), { name: 'AbortError' });
  for (const body of ['not json', '{}', '{"custom":{"noul":"0.9"}}', '{"custom":{"noul":1.1}}']) {
    const classifier = new JevClassifier({ fetchImpl: async () => new Response(body) });
    await assert.rejects(classifier.classify(request), { code: 'API_INVALID_RESPONSE' });
  }
});
