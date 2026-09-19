const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function content(title, id = 'local-id') { return { source: 'youtube', id, type: 'video', title, author: '', text: '' }; }

function createArea() {
  const values = {};
  return {
    values,
    get(key, callback) { callback({ [key]: values[key] }); },
    set(value, callback) { Object.assign(values, value); callback(); },
    remove(key, callback) { delete values[key]; callback(); }
  };
}

function createBackgroundHarness() {
  const local = createArea();
  const session = createArea();
  let messageListener;
  let installedListener;
  let startupListener;
  const requests = [];
  const createdTabs = [];
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const chrome = {
    storage: { local, session },
    runtime: {
      onMessage: { addListener(listener) { messageListener = listener; } },
      onInstalled: { addListener(listener) { installedListener = listener; } },
      onStartup: { addListener(listener) { startupListener = listener; } },
      getURL(file) { return `chrome-extension://test/${file}`; },
      openOptionsPage() { return Promise.resolve(); }
    },
    tabs: { create(options) { createdTabs.push(options); return Promise.resolve(); } }
  };
  const sandbox = {
    chrome,
    console,
    fetch: async (url, options) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      requests.push({ url, options, body: JSON.parse(options.body) });
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (options.body.includes('malformed-response')) return { ok: true, status: 200, text: async () => '{}' };
        if (options.body.includes('network-fail')) throw new TypeError('network failed');
        const body = JSON.parse(options.body);
        const answers = {};
        Object.keys(body.questions).forEach((id) => { answers[id] = { type: 'noul', noul: body.state.content.includes('hide-me') ? (id === 'sexual_content' ? 0.93 : 0.12) : 0.08 }; });
        return { ok: true, status: 200, text: async () => JSON.stringify({ model: 'jev-1.13.0', answers, usage: { input_tokens: 1, output_tokens: 1 } }) };
      } finally {
        activeRequests -= 1;
      }
    },
    performance,
    AbortController,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    JSON,
    Math,
    Object,
    String,
    Number,
    Boolean,
    Array,
    Map,
    Set,
    Uint8Array,
    TextEncoder
  };
  vm.createContext(sandbox);
  sandbox.importScripts = (...files) => files.forEach((file) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), sandbox, { filename: file }));
  const background = fs.readFileSync(path.join(__dirname, '..', 'src/background.js'), 'utf8');
  vm.runInContext(background, sandbox);
  assert.equal(typeof messageListener, 'function');
  assert.equal(typeof installedListener, 'function');
  assert.equal(typeof startupListener, 'function');
  const dispatch = (message) => new Promise((resolve) => messageListener(message, {}, resolve));
  return { dispatch, requests, local, session, createdTabs, startupListener, get maxActiveRequests() { return maxActiveRequests; } };
}

test('background pipeline keeps the API key out of the request body, caches duplicates, and fails open', async () => {
  const harness = createBackgroundHarness();
  const E = require('../src/shared/core.js');
  await harness.dispatch({ type: E.MESSAGE.SAVE_API_KEY, payload: { apiKey: 'apikey_secret' } });
  const first = await harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('hide-me', 'reply-1') } });
  assert.equal(first.ok, true);
  assert.equal(first.shouldHide, true);
  assert.equal(harness.requests.length, 1);
  assert.match(harness.requests[0].options.headers.Authorization, /^Bearer apikey_secret$/);
  assert.equal(JSON.parse(harness.requests[0].body.state.content).title, 'hide-me');
  assert.equal(JSON.parse(harness.requests[0].body.state.content).id, undefined);
  assert.equal(JSON.stringify(harness.requests[0].body).includes('apikey_secret'), false);

  const cached = await harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('hide-me', 'reply-2') } });
  assert.equal(cached.ok, true);
  assert.equal(cached.cache, 'hit');
  assert.equal(harness.requests.length, 1);

  const rechecked = await harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('hide-me', 'reply-2'), force: true } });
  assert.equal(rechecked.ok, true);
  assert.equal(rechecked.cache, 'miss');
  assert.equal(harness.requests.length, 2);

  await harness.dispatch({ type: E.MESSAGE.SAVE_CONFIG, payload: { dailyLimit: 1 } });
  const limited = await harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('another safe video', 'reply-3') } });
  assert.equal(limited.ok, false);
  assert.equal(limited.error, 'DAILY_LIMIT_REACHED');

  await harness.dispatch({ type: E.MESSAGE.SAVE_CONFIG, payload: { dailyLimit: 2000 } });
  const failed = await harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('network-fail', 'reply-4') } });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'API_UNAVAILABLE');
  assert.equal(failed.shouldHide, undefined);
});

test('background queue never exceeds the configured concurrency', async () => {
  const harness = createBackgroundHarness();
  const E = require('../src/shared/core.js');
  await harness.dispatch({ type: E.MESSAGE.SAVE_API_KEY, payload: { apiKey: 'apikey_secret' } });
  await harness.dispatch({ type: E.MESSAGE.SAVE_CONFIG, payload: { maxConcurrency: 2 } });
  const results = await Promise.all(Array.from({ length: 7 }, (_, index) => harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content(`safe-${index}`, `reply-${index}`) } })));
  assert.ok(results.every((result) => result.ok));
  assert.ok(harness.maxActiveRequests <= 2, `observed ${harness.maxActiveRequests} concurrent requests`);
});

test('unconfigured startup opens the onboarding page as a fallback', async () => {
  const harness = createBackgroundHarness();
  await harness.startupListener();
  assert.equal(harness.createdTabs.length, 1);
  assert.equal(harness.createdTabs[0].url, 'chrome-extension://test/src/onboarding.html');
});

test('video totals accumulate across pages independently from page metrics', async () => {
  const harness = createBackgroundHarness();
  const E = require('../src/shared/core.js');
  await harness.dispatch({ type: E.MESSAGE.RECORD_CONTENT_EVENT, payload: { action: 'checked', page: { checked: 1, hidden: 0 } } });
  await harness.dispatch({ type: E.MESSAGE.RECORD_CONTENT_EVENT, payload: { action: 'hidden', page: { checked: 1, hidden: 1 } } });
  const state = await harness.dispatch({ type: E.MESSAGE.GET_STATE });
  assert.equal(state.stats.totalChecked, 1);
  assert.equal(state.stats.totalHidden, 1);
  assert.equal(state.stats.pageChecked, 1);
  assert.equal(state.stats.pageHidden, 1);
});

test('cached probabilities are re-evaluated after threshold edits without another API call', async () => {
  const harness = createBackgroundHarness();
  const E = require('../src/shared/core.js');
  await harness.dispatch({ type: E.MESSAGE.SAVE_API_KEY, payload: { apiKey: 'apikey_secret' } });
  const first = await harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('hide-me') } });
  assert.equal(first.shouldHide, true);
  const rules = E.DEFAULT_RULES.map((rule) => ({ ...rule, threshold: 0.99 }));
  await harness.dispatch({ type: E.MESSAGE.SAVE_CONFIG, payload: { rules } });
  const second = await harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('hide-me') } });
  assert.equal(second.cache, 'hit');
  assert.equal(second.shouldHide, false);
  assert.equal(harness.requests.length, 1);
});

test('concurrent requests consume the exact daily limit without double-counting reservations', async () => {
  const harness = createBackgroundHarness();
  const E = require('../src/shared/core.js');
  await harness.dispatch({ type: E.MESSAGE.SAVE_API_KEY, payload: { apiKey: 'apikey_secret' } });
  await harness.dispatch({ type: E.MESSAGE.SAVE_CONFIG, payload: { dailyLimit: 3, maxConcurrency: 3 } });
  const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content(`unique-${index}`) } })));
  assert.equal(responses.filter((response) => response.ok).length, 3);
  assert.equal(harness.requests.length, 3);
  assert.equal(responses.filter((response) => response.error === 'DAILY_LIMIT_REACHED').length, 3);
});

test('simultaneous duplicates share a request and disabled protection sends no content', async () => {
  const harness = createBackgroundHarness();
  const E = require('../src/shared/core.js');
  const missing = await harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('safe') } });
  assert.equal(missing.error, 'API_KEY_MISSING');
  await harness.dispatch({ type: E.MESSAGE.SAVE_API_KEY, payload: { apiKey: 'apikey_secret' } });
  await Promise.all(Array.from({ length: 4 }, () => harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('same-title') } })));
  assert.equal(harness.requests.length, 1);
  await harness.dispatch({ type: E.MESSAGE.SAVE_CONFIG, payload: { enabled: false } });
  const disabled = await harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('hide-me') } });
  assert.equal(disabled.shouldHide, false);
  assert.equal(harness.requests.length, 1);
});

test('malformed successful responses fail open and are not cached as safe decisions', async () => {
  const harness = createBackgroundHarness();
  const E = require('../src/shared/core.js');
  await harness.dispatch({ type: E.MESSAGE.SAVE_API_KEY, payload: { apiKey: 'apikey_secret' } });
  const response = await harness.dispatch({ type: E.MESSAGE.CLASSIFY_CONTENT, payload: { content: content('malformed-response') } });
  assert.equal(response.ok, false);
  assert.equal(response.error, 'API_INVALID_RESPONSE');
  assert.equal(Object.keys(harness.session.values[E.CACHE_KEY] || {}).length, 0);
});
