import type { StatsChanges, Message, MessageSuccesses, Failure } from './types';
import JevClassifier from './providers/jev';
import { createClassificationService } from './services/classification';

import * as E from './shared/core';
const runtime = globalThis.chrome;
let statsGate = Promise.resolve();

async function writeStats(changes: StatsChanges) {
  const previous = statsGate;
  let release!: () => void;
  statsGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const current = await E.getStats(runtime);
    const next = { ...(changes || {}) };
    for (const key of ['requests', 'cacheHits', 'errors', 'checked', 'hidden'] as const) {
      const deltaKey = `${key}Delta` as const;
      if (Object.prototype.hasOwnProperty.call(next, deltaKey)) {
        const delta = Number(next[deltaKey] || 0);
        next[key] = current[key] + delta;
        if (key === 'checked') next.totalChecked = current.totalChecked + delta;
        if (key === 'hidden') next.totalHidden = current.totalHidden + delta;
        delete next[deltaKey];
      }
    }
    return await E.updateStats(runtime, next);
  } finally {
    release();
  }
}

// Composition root: swap the classifier here without changing adapters or policy.
const classifier = new JevClassifier();
const classification = createClassificationService({ runtime, classifier, writeStats });

async function openOnboarding(): Promise<{ ok: true }> {
  await runtime.tabs.create({ url: runtime.runtime.getURL('src/onboarding.html') });
  return { ok: true };
}

async function state() {
  const config = await E.loadConfig(runtime, true);
  const stats = await E.getStats(runtime);
  return {
    config: E.sanitizeConfig(config),
    hasApiKey: Boolean(config.typesafeApiKey),
    needsOnboarding: !config.typesafeApiKey && config.onboardingCompleted !== true,
    apiKeyMask: E.maskSecret(config.typesafeApiKey),
    stats,
  };
}

async function handleMessage(
  message: Message
): Promise<MessageSuccesses[keyof MessageSuccesses] | Failure> {
  const { type, payload } = message;
  if (type === E.MESSAGE.GET_STATE) return { ok: true, ...(await state()) };
  if (type === E.MESSAGE.SAVE_API_KEY) {
    const apiKey = String((payload && payload.apiKey) || '').trim();
    if (apiKey.length > 512) return { ok: false, error: 'API_KEY_INVALID_FORMAT' };
    await E.saveConfig(runtime, { typesafeApiKey: apiKey });
    return { ok: true, hasApiKey: Boolean(apiKey), apiKeyMask: E.maskSecret(apiKey) };
  }
  if (type === E.MESSAGE.TEST_CONNECTION) {
    const config = await E.loadConfig(runtime, true);
    const apiKey = String((payload && payload.apiKey) || config.typesafeApiKey || '').trim();
    if (!apiKey) return { ok: false, error: 'API_KEY_MISSING' };
    try {
      const latencyMs = await classifier.testConnection({ apiKey, model: config.model });
      return { ok: true, latencyMs };
    } catch (error) {
      return { ok: false, error: E.cleanError(error) };
    }
  }
  if (type === E.MESSAGE.OPEN_ONBOARDING) return openOnboarding();
  if (type === E.MESSAGE.CLASSIFY_CONTENT) return classification.classify(payload || {});
  if (type === E.MESSAGE.SAVE_CONFIG) {
    const saved = await E.saveConfig(runtime, payload || {});
    return { ok: true, config: E.sanitizeConfig(saved) };
  }
  if (type === E.MESSAGE.RECORD_CONTENT_EVENT) {
    const action = String((payload && payload.action) || '');
    const page = payload && payload.page;
    const changes: StatsChanges = {};
    if (action === 'checked') changes.checkedDelta = 1;
    if (action === 'hidden') changes.hiddenDelta = 1;
    if (page && Number.isFinite(page.checked))
      changes.pageChecked = Math.max(0, Number(page.checked));
    if (page && Number.isFinite(page.hidden)) changes.pageHidden = Math.max(0, Number(page.hidden));
    if (page && Number.isFinite(page.safe)) changes.pageSafe = Math.max(0, Number(page.safe));
    if (page && Number.isFinite(page.pending))
      changes.pagePending = Math.max(0, Number(page.pending));
    if (page && Number.isFinite(page.errors)) changes.pageErrors = Math.max(0, Number(page.errors));
    if (page && Number.isFinite(page.latencyMs))
      changes.pageLatencyMs = Math.max(0, Number(page.latencyMs));
    await writeStats(changes);
    return { ok: true };
  }
  if (type === E.MESSAGE.CLEAR_CACHE) {
    await classification.clearCache();
    return { ok: true };
  }
  if (type === E.MESSAGE.OPEN_SETTINGS) {
    await runtime.runtime.openOptionsPage();
    return { ok: true };
  }
  return { ok: false, error: 'UNKNOWN_MESSAGE' };
}

runtime.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: E.cleanError(error) }));
  return true;
});

runtime.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await E.saveConfig(runtime, E.createDefaultConfig());
    await openOnboarding();
    return;
  }
  if (details.reason === 'update') {
    const config = await E.loadConfig(runtime, true);
    if (!config.typesafeApiKey && config.onboardingCompleted !== true) await openOnboarding();
  }
});

runtime.runtime.onStartup.addListener(async () => {
  const config = await E.loadConfig(runtime, true);
  if (!config.typesafeApiKey && config.onboardingCompleted !== true) await openOnboarding();
});
