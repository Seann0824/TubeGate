import { DEFAULT_RULES, migrateBuiltinRule } from './default-rules';
import { record } from '../types';
import type { Rule, Config, Stats, StorageRuntime } from '../types';

const APP = 'SocialMediaGate';
const STORAGE_KEY = 'socialMediaGateConfig';
const STATS_KEY = 'socialMediaGateStats';
const CACHE_KEY = 'socialMediaGateCache';
const MODEL_VERSION = 'jev-latest';
const DECISION_VERSION = 'content-v2';
const API_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MAX_CONTENT_LENGTH = 4000;
const MESSAGE = {
  GET_STATE: 'GET_STATE',
  SAVE_API_KEY: 'SAVE_API_KEY',
  TEST_CONNECTION: 'TEST_CONNECTION',
  OPEN_ONBOARDING: 'OPEN_ONBOARDING',
  CLASSIFY_CONTENT: 'CLASSIFY_CONTENT',
  SAVE_CONFIG: 'SAVE_CONFIG',
  RECORD_CONTENT_EVENT: 'RECORD_CONTENT_EVENT',
  CLEAR_CACHE: 'CLEAR_CACHE',
  OPEN_SETTINGS: 'OPEN_SETTINGS',
} as const;

const DEFAULT_CONFIG: Config = {
  enabled: true,
  onboardingCompleted: false,
  rulesVersion: 2,
  recommendationsOnly: true,
  failOpen: true,
  preload: false,
  showPlaceholder: true,
  showConfidence: true,
  showCheckControls: true,
  maxConcurrency: 3,
  cacheTtlHours: 24,
  dailyLimit: 1000,
  debug: false,
  model: MODEL_VERSION,
  apiEndpoint: API_ENDPOINT,
  rules: DEFAULT_RULES,
};

const INVISIBLE_CHAR_RE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2800\u3164\uFEFF]/gu;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeThreshold(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0.5, 0.99) : 0.8;
}

function normalizeRule(input: unknown, index = 0): Rule {
  const rule = record(input);
  return {
    id: String(rule.id || `custom_rule_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_'),
    name: String(rule.name || '未命名规则')
      .trim()
      .slice(0, 80),
    description: String(rule.description || rule.trueCriteria || rule.instructions || '')
      .trim()
      .slice(0, 500),
    instructions: String(
      rule.instructions ||
        '判断 `content` 是否符合以下过滤条件：' +
          (rule.description || rule.name || '自定义内容') +
          '。'
    )
      .trim()
      .slice(0, 1200),
    trueCriteria: String(rule.trueCriteria || rule.description || '')
      .trim()
      .slice(0, 800),
    falseCriteria: String(rule.falseCriteria || '')
      .trim()
      .slice(0, 800),
    threshold: normalizeThreshold(rule.threshold),
    enabled: rule.enabled !== false,
    builtin: Boolean(rule.builtin),
  };
}

function createDefaultConfig() {
  return clone(DEFAULT_CONFIG);
}

function normalizeConfig(input: unknown): Config {
  const raw = record(input);
  const configuredRules =
    Array.isArray(raw.rules) && raw.rules.length
      ? raw.rules.map(normalizeRule).map(migrateBuiltinRule)
      : clone(DEFAULT_RULES);
  const configuredIds = new Set(configuredRules.map((rule) => rule.id));
  const mergedRules = configuredRules.concat(
    DEFAULT_RULES.filter((rule) => !configuredIds.has(rule.id)).map(clone)
  );
  const rules = mergedRules;
  return {
    enabled: raw.enabled !== false,
    onboardingCompleted: raw.onboardingCompleted === true,
    rulesVersion: 2,
    recommendationsOnly: true,
    failOpen: true,
    preload: raw.preload === true,
    showPlaceholder: raw.showPlaceholder !== false,
    showConfidence: raw.showConfidence !== false,
    showCheckControls: raw.showCheckControls !== false,
    maxConcurrency: clamp(Number(raw.maxConcurrency) || 3, 1, 8),
    cacheTtlHours: clamp(Number(raw.cacheTtlHours) || 24, 1, 168),
    dailyLimit: clamp(Number(raw.dailyLimit) || 1000, 1, 100000),
    debug: raw.debug === true,
    model: String(raw.model || MODEL_VERSION).slice(0, 80),
    apiEndpoint: API_ENDPOINT,
    rules,
  };
}

function sanitizeConfig(input: unknown) {
  return normalizeConfig(input);
}

function activeRules(config: unknown) {
  return normalizeConfig(config).rules.filter((rule) => rule.enabled);
}

function normalizeText(value: unknown) {
  return String(value || '')
    .replace(INVISIBLE_CHAR_RE, '')
    .replace(/[\t\n\r ]+/g, ' ')
    .trim()
    .slice(0, MAX_CONTENT_LENGTH);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce(
        (out, key) => {
          out[key] = stableValue(record(value)[key]);
          return out;
        },
        {} as Record<string, unknown>
      );
  }
  return value;
}

function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function fallbackHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function hashText(value: unknown) {
  const source = String(value);
  if (globalThis.crypto && globalThis.crypto.subtle && globalThis.TextEncoder) {
    const data = new globalThis.TextEncoder().encode(source);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  return fallbackHash(source);
}

async function rulesFingerprint(rules: Rule[]) {
  return hashText(
    stableStringify(
      (rules || [])
        .filter((rule) => rule.enabled !== false)
        .map((rule) => ({
          id: rule.id,
          instructions: rule.instructions,
          trueCriteria: rule.trueCriteria,
          falseCriteria: rule.falseCriteria,
        }))
    )
  );
}

async function cacheKey(text: string, rules: Rule[], model?: string, provider = 'jev') {
  const normalized = String(text || '').trim();
  const fingerprint = await rulesFingerprint(rules);
  return hashText(
    stableStringify({
      normalized,
      fingerprint,
      provider,
      model: model || MODEL_VERSION,
      decisionVersion: DECISION_VERSION,
    })
  );
}

function maskSecret(value: unknown) {
  const secret = String(value || '');
  if (!secret) return '';
  if (secret.length <= 8) return '••••••••';
  return `${secret.slice(0, 4)}${'•'.repeat(Math.min(20, secret.length - 8))}${secret.slice(-4)}`;
}

function storageArea(chromeApi: StorageRuntime, areaName: 'local' | 'session') {
  return chromeApi && chromeApi.storage && (chromeApi.storage[areaName] || chromeApi.storage.local);
}

function storageGet(
  chromeApi: StorageRuntime,
  areaName: 'local' | 'session',
  key: string
): Promise<Record<string, unknown>> {
  const area = storageArea(chromeApi, areaName);
  if (!area) return Promise.resolve({});
  return new Promise((resolve) => {
    try {
      area.get(key, (result) => resolve(result || {}));
    } catch (_) {
      resolve({});
    }
  });
}

function storageSet(
  chromeApi: StorageRuntime,
  areaName: 'local' | 'session',
  value: Record<string, unknown>
): Promise<void> {
  const area = storageArea(chromeApi, areaName);
  if (!area) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      area.set(value, resolve);
    } catch (_) {
      resolve();
    }
  });
}

function storageRemove(
  chromeApi: StorageRuntime,
  areaName: 'local' | 'session',
  key: string
): Promise<void> {
  const area = storageArea(chromeApi, areaName);
  if (!area) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      area.remove(key, resolve);
    } catch (_) {
      resolve();
    }
  });
}

async function loadConfig(chromeApi: StorageRuntime, includeSecret = false) {
  const stored = await storageGet(chromeApi, 'local', STORAGE_KEY);
  const config = normalizeConfig(stored[STORAGE_KEY]);
  if (includeSecret)
    config.typesafeApiKey = String(record(stored[STORAGE_KEY]).typesafeApiKey || '');
  return config;
}

async function saveConfig(chromeApi: StorageRuntime, patch: Partial<Config>) {
  const stored = await storageGet(chromeApi, 'local', STORAGE_KEY);
  const current = record(stored[STORAGE_KEY]);
  const next = { ...current, ...sanitizeConfig({ ...current, ...patch }) };
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'typesafeApiKey')) {
    next.typesafeApiKey = String(patch.typesafeApiKey || '').trim();
  } else if (current.typesafeApiKey) {
    next.typesafeApiKey = String(current.typesafeApiKey);
  }
  await storageSet(chromeApi, 'local', { [STORAGE_KEY]: next });
  return normalizeConfig(next);
}

async function getStats(chromeApi: StorageRuntime): Promise<Stats> {
  const today = new Date().toISOString().slice(0, 10);
  const stored = await storageGet(chromeApi, 'local', STATS_KEY);
  const stats = record(stored[STATS_KEY]);
  const totalChecked = Number(stats.totalChecked ?? stats.checked) || 0;
  const totalHidden = Number(stats.totalHidden ?? stats.hidden) || 0;
  if (stats.day !== today) {
    return {
      day: today,
      requests: 0,
      checked: 0,
      hidden: 0,
      totalChecked,
      totalHidden,
      cacheHits: 0,
      errors: 0,
      latencyMs: 0,
      lastError: '',
      pageChecked: 0,
      pageHidden: 0,
      pageSafe: 0,
      pagePending: 0,
      pageErrors: 0,
      pageLatencyMs: 0,
    };
  }
  return {
    day: today,
    requests: Number(stats.requests) || 0,
    checked: Number(stats.checked) || 0,
    hidden: Number(stats.hidden) || 0,
    totalChecked,
    totalHidden,
    cacheHits: Number(stats.cacheHits) || 0,
    errors: Number(stats.errors) || 0,
    latencyMs: Number(stats.latencyMs) || 0,
    lastError: String(stats.lastError || ''),
    pageChecked: Number(stats.pageChecked) || 0,
    pageHidden: Number(stats.pageHidden) || 0,
    pageSafe: Number(stats.pageSafe) || 0,
    pagePending: Number(stats.pagePending) || 0,
    pageErrors: Number(stats.pageErrors) || 0,
    pageLatencyMs: Number(stats.pageLatencyMs) || 0,
  };
}

async function updateStats(chromeApi: StorageRuntime, changes: Partial<Stats>) {
  const next = { ...(await getStats(chromeApi)), ...(changes || {}) };
  await storageSet(chromeApi, 'local', { [STATS_KEY]: next });
  return next;
}

function cleanError(input: unknown) {
  const error = record(input);
  const code = error && error.code ? String(error.code) : '';
  if (code) return code;
  const status = error && Number(error.status);
  if (status === 401 || status === 403) return 'API_KEY_INVALID';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'API_SERVER_ERROR';
  if (error && error.name === 'AbortError') return 'API_TIMEOUT';
  return 'API_UNAVAILABLE';
}

function debugLog(config: Config, event: string, data: Record<string, unknown>) {
  if (
    !config ||
    !config.debug ||
    !globalThis.console ||
    typeof globalThis.console.debug !== 'function'
  )
    return;
  const safe = { ...(data || {}) };
  delete safe.apiKey;
  delete safe.typesafeApiKey;
  delete safe.content;
  globalThis.console.debug(`[TubeGate] ${event}`, safe);
}

export {
  APP,
  STORAGE_KEY,
  STATS_KEY,
  CACHE_KEY,
  MODEL_VERSION,
  DECISION_VERSION,
  API_ENDPOINT,
  MAX_CONTENT_LENGTH,
  MESSAGE,
  DEFAULT_RULES,
  DEFAULT_CONFIG,
  clone,
  clamp,
  normalizeRule,
  normalizeThreshold,
  createDefaultConfig,
  normalizeConfig,
  sanitizeConfig,
  activeRules,
  normalizeText,
  stableStringify,
  hashText,
  rulesFingerprint,
  cacheKey,
  maskSecret,
  storageGet,
  storageSet,
  storageRemove,
  loadConfig,
  saveConfig,
  getStats,
  updateStats,
  cleanError,
  debugLog,
};
