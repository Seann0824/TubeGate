const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/shared/core.js');
const Y = require('../src/adapters/youtube/urls.js');
const C = require('../src/core/content.js');
const D = require('../src/core/decision.js');
const P = require('../src/providers/jev-protocol.js');

test('only supported YouTube pages are eligible; player timestamps do not reset the route', () => {
  assert.equal(Y.pageContext('https://www.youtube.com/').kind, 'home');
  assert.equal(Y.pageContext('https://www.youtube.com/results?search_query=cats').kind, 'search');
  assert.notEqual(Y.pageContext('https://www.youtube.com/results?search_query=cats').key, Y.pageContext('https://www.youtube.com/results?search_query=dogs').key);
  assert.equal(Y.pageContext('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12').key, Y.pageContext('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90').key);
  for (const path of ['/feed/subscriptions', '/feed/history', '/@channel', '/shorts/dQw4w9WgXcQ', '/playlist?list=test', '/watch?v=invalid']) assert.equal(Y.pageContext(`https://www.youtube.com${path}`), null);
  assert.equal(Y.pageContext('https://www.youtube.com.evil.com/'), null);
});

test('video identities accept watch and Shorts cards, reject playlists and external links', () => {
  for (const url of ['/watch?v=dQw4w9WgXcQ&list=example', '/shorts/dQw4w9WgXcQ']) assert.equal(Y.videoIdFromUrl(url), 'dQw4w9WgXcQ');
  for (const url of ['/playlist?list=example', '/watch?v=', '/watch?v=short', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)']) assert.equal(Y.videoIdFromUrl(url), null);
});

test('classifier input preserves each video field and caps untrusted text', () => {
  const content = C.serializeContent({ source: 'youtube', id: 'example', type: 'video', title: '标题\u200b\n test', author: '频道', text: '视频描述', url: 'private', videoId: 'private' });
  assert.match(content, /"title":"标题 test"/);
  assert.match(content, /"author":"频道"/);
  assert.match(content, /"text":"视频描述"/);
  assert.equal(content.includes('private'), false);
  const long = C.serializeContent({ source: 'youtube', id: 'example', type: 'video', title: 'a'.repeat(10000), author: 'channel', text: 'b'.repeat(10000) });
  assert.ok(long.length < E.MAX_CONTENT_LENGTH);
  assert.match(long, /channel/);
});

test('rules use individual thresholds and do not inherit comment emoji overrides', () => {
  const rules = E.DEFAULT_RULES;
  const response = { answers: { sexual_content: { pTrue: 0.84 }, sexual_solicitation: { noul: 0.5 }, spam_behavior: { probabilities: { true: 0.91 } } } };
  const decision = D.decide(P.readScores(response, rules), rules);
  assert.deepEqual(decision.matches.map((item) => item.ruleId), ['spam_behavior']);
  assert.equal(D.decide({}, rules.map((rule) => ({ ...rule, enabled: false }))).shouldHide, false);
  for (const malformed of [null, {}, { answers: { sexual_content: { noul: '1' } } }, { answers: { sexual_content: { noul: 3 } } }]) {
    assert.throws(() => D.decide(P.readScores(malformed, rules), rules), { code: 'API_INVALID_RESPONSE' });
  }
});

test('custom and edited builtin rules survive saving and secrets are sanitized', () => {
  const edited = { ...E.DEFAULT_RULES[0], instructions: '只隐藏游戏视频', name: '游戏', threshold: 0.93 };
  const config = E.normalizeConfig({ rules: [edited], typesafeApiKey: 'secret', apiEndpoint: 'https://evil.com', failOpen: false });
  assert.equal(config.rules[0].instructions, edited.instructions);
  assert.equal(config.rules[0].threshold, 0.93);
  assert.equal(config.typesafeApiKey, undefined);
  assert.equal(config.apiEndpoint, E.API_ENDPOINT);
  assert.equal(config.failOpen, true);
});

test('cache identity tracks wording and model but allows reusing scores after threshold changes', async () => {
  const rules = E.DEFAULT_RULES;
  const base = await E.cacheKey('video', rules, 'model');
  assert.equal(base, await E.cacheKey('video', rules.map((rule) => ({ ...rule, threshold: .99 })), 'model'));
  assert.notEqual(base, await E.cacheKey('changed title', rules, 'model'));
  assert.notEqual(base, await E.cacheKey('video', rules, 'other model'));
  assert.notEqual(base, await E.cacheKey('video', rules.map((rule) => ({ ...rule, instructions: 'changed' })), 'model'));
});
