import { record } from '../types';
import type {
  StorageRuntime,
  Classifier,
  StatsChanges,
  ClassificationResult,
  MessagePayloads,
} from '../types';
import * as E from '../shared/core';
import * as C from '../core/content';
import * as D from '../core/decision';
import RequestQueue from './request-queue';

function createClassificationService({
  runtime,
  classifier,
  writeStats,
}: {
  runtime: StorageRuntime;
  classifier: Classifier;
  writeStats: (changes: StatsChanges) => Promise<unknown>;
}) {
  if (!classifier?.id || typeof classifier.classify !== 'function')
    throw new TypeError('Classifier requires id and classify');
  const queue = new RequestQueue<ClassificationResult>(3);
  let quotaGate = Promise.resolve();
  let cacheGate = Promise.resolve();
  let cacheEpoch = 0;

  async function reserveRequest(limit: number) {
    const previous = quotaGate;
    let release!: () => void;
    quotaGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if ((await E.getStats(runtime)).requests >= limit) return false;
      await writeStats({ requestsDelta: 1 });
      return true;
    } finally {
      release();
    }
  }

  async function updateCache(operation: () => Promise<void>) {
    const previous = cacheGate;
    let release!: () => void;
    cacheGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async function clearCache() {
    cacheEpoch += 1;
    await updateCache(async () => {
      await E.storageRemove(runtime, 'session', E.CACHE_KEY);
      await E.storageRemove(runtime, 'local', E.CACHE_KEY);
    });
  }

  async function classify(
    payload: MessagePayloads['CLASSIFY_CONTENT']
  ): Promise<ClassificationResult> {
    const config = await E.loadConfig(runtime, true);
    const rules = E.activeRules(config);
    if (!config.enabled || !rules.length)
      return { ok: true, shouldHide: false, matches: [], results: {} };
    let content;
    try {
      content = C.normalizeContent(payload?.content);
    } catch (_) {
      return { ok: false, error: 'INVALID_CONTENT' };
    }
    if (!config.typesafeApiKey) return { ok: false, error: 'API_KEY_MISSING' };

    const key = await E.cacheKey(C.serializeContent(content), rules, config.model, classifier.id);
    const epoch = cacheEpoch;
    const stored = await E.storageGet(runtime, 'session', E.CACHE_KEY);
    const cached = record(record(stored[E.CACHE_KEY])[key]);
    if (
      !payload.force &&
      typeof cached.createdAt === 'number' &&
      Date.now() - cached.createdAt < config.cacheTtlHours * 3600000
    ) {
      try {
        const decision = D.decide(cached.scores, rules);
        await writeStats({ cacheHitsDelta: 1 });
        return { ok: true, ...decision, cache: 'hit' };
      } catch (_) {
        /* Ignore an obsolete or corrupt cache entry; classify afresh. */
      }
    }

    queue.setConcurrency(config.maxConcurrency);
    const configHash = await E.hashText(E.stableStringify(config));
    const requestKey = `${key}:${configHash}`;
    return queue.enqueue(requestKey, async () => {
      const latest = await E.loadConfig(runtime, true);
      if (!latest.enabled || E.stableStringify(latest) !== E.stableStringify(config))
        return { ok: false, error: 'CONFIG_CHANGED' };
      if (!(await reserveRequest(latest.dailyLimit)))
        return { ok: false, error: 'DAILY_LIMIT_REACHED' };
      try {
        const result = await classifier.classify({
          apiKey: config.typesafeApiKey!,
          model: config.model,
          content,
          rules,
        });
        const decision = D.decide(result.scores, rules);
        await updateCache(async () => {
          if (epoch !== cacheEpoch) return;
          const current = await E.storageGet(runtime, 'session', E.CACHE_KEY);
          const entries = Object.entries({
            ...record(current[E.CACHE_KEY]),
            [key]: { createdAt: Date.now(), scores: decision.results },
          });
          await E.storageSet(runtime, 'session', {
            [E.CACHE_KEY]: Object.fromEntries(entries.slice(-500)),
          });
        });
        await writeStats({ latencyMs: result.latencyMs, lastError: '' });
        E.debugLog(config, 'classified', {
          source: content.source,
          contentId: content.id,
          contentHash: key,
          latencyMs: result.latencyMs,
        });
        return { ok: true, ...decision, latencyMs: result.latencyMs, cache: 'miss' };
      } catch (error) {
        const code = E.cleanError(error);
        await writeStats({ errorsDelta: 1, lastError: code });
        return { ok: false, error: code };
      }
    });
  }

  return { classify, clearCache };
}

export { createClassificationService };
