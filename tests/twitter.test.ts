import test from 'node:test';
import assert from 'node:assert/strict';
import { pageContext, postIdFromUrl, matches, TWITTER_HOSTS } from '../src/adapters/twitter/urls';
import { normalizeConfig, DEFAULT_RULES, cacheKey } from '../src/shared/core';
import { LEGACY_YOUTUBE_RULES } from '../src/shared/default-rules';
import { serializeContent } from '../src/core/content';

test('Twitter URL policy covers exact HTTPS X and legacy hosts only', () => {
  for (const host of TWITTER_HOSTS) assert.equal(matches(`https://${host}/home`), true);
  for (const url of [
    'http://x.com/home',
    'https://x.com.evil.test/home',
    'https://api.x.com/home',
    'https://mobile.twitter.com/home',
    'https://x.com:444/home',
    'https://user:pass@x.com/home',
    'https://evil.test/?x.com',
    'not a url',
  ]) {
    assert.equal(matches(url), false);
    assert.equal(pageContext(url), null);
  }
});

test('Twitter page scope excludes private routes, profiles, composers and media overlays', () => {
  assert.equal(pageContext('https://x.com/home')?.kind, 'home');
  assert.equal(pageContext('https://twitter.com/search?q=cats&f=live')?.kind, 'search');
  assert.equal(pageContext('https://x.com/writer/status/123456')?.focusedContentId, '123456');
  for (const path of [
    '/',
    '/messages',
    '/messages/123',
    '/i/chat',
    '/notifications',
    '/settings/account',
    '/i/bookmarks',
    '/compose/post',
    '/compose/tweet',
    '/writer',
    '/writer/with_replies',
    '/search',
    '/search?q=cats&f=user',
    '/writer/status/123/photo/1',
    '/writer/status/123/video/1',
    '/writer/status/123/analytics',
  ]) {
    assert.equal(pageContext(`https://x.com${path}`), null, path);
  }
});

test('Twitter route identity changes for query/filter/post but ignores tracking parameters and aliases', () => {
  assert.equal(
    pageContext('https://x.com/home?lang=en')?.key,
    pageContext('https://twitter.com/home')?.key
  );
  const first = pageContext('https://x.com/search?q=cats&f=live')?.key;
  assert.equal(first, pageContext('https://x.com/search?src=typed_query&f=live&q=cats')?.key);
  for (const url of [
    'https://x.com/search?q=dogs&f=live',
    'https://x.com/search?q=cats&f=top',
    'https://x.com/search?q=cats&f=live&pf=on',
  ])
    assert.notEqual(first, pageContext(url)?.key);
  assert.equal(
    pageContext('https://x.com/writer/status/123?s=20')?.key,
    pageContext('https://twitter.com/writer/status/123')?.key
  );
  assert.notEqual(
    pageContext('https://x.com/writer/status/123')?.key,
    pageContext('https://x.com/writer/status/124')?.key
  );
});

test('Twitter identity accepts canonical status URLs without guessing from action or media links', () => {
  for (const url of [
    '/writer/status/1234567890123456789',
    'https://twitter.com/writer/status/1234567890123456789?s=20',
    '/i/web/status/1234567890123456789',
  ])
    assert.equal(postIdFromUrl(url), '1234567890123456789');
  for (const url of [
    '/writer/status/0',
    '/writer/status/nope',
    '/writer/status/123/photo/1',
    '/writer/status/123/likes',
    'https://evil.test/writer/status/123',
    '/messages/123',
  ])
    assert.equal(postIdFromUrl(url), null);
});

test('untouched legacy defaults gain neutral wording while edits, switches and thresholds survive', () => {
  const old = LEGACY_YOUTUBE_RULES.map((rule) => ({ ...rule, threshold: 0.97, enabled: false }));
  const migrated = normalizeConfig({ rules: old, rulesVersion: 1 });
  assert.equal(migrated.rulesVersion, 2);
  migrated.rules.forEach((rule, index) => {
    assert.equal(rule.instructions, DEFAULT_RULES[index].instructions);
    assert.equal(rule.threshold, 0.97);
    assert.equal(rule.enabled, false);
  });
  const edited = { ...old[0], instructions: '只过滤 YouTube 视频' };
  const custom = { ...old[1], id: 'custom_topic', builtin: false };
  const preserved = normalizeConfig({ rules: [edited, custom] });
  assert.deepEqual(preserved.rules[0], edited);
  assert.deepEqual(preserved.rules[1], custom);
  assert.deepEqual(normalizeConfig(migrated), migrated);
});

test('Twitter serialization excludes IDs and keeps its cached scores separate from YouTube', async () => {
  const post = {
    source: 'twitter',
    type: 'post',
    id: 'private-local-id',
    title: '',
    author: 'author',
    text: 'same words',
  };
  const serialized = serializeContent(post);
  assert.equal(serialized.includes(post.id), false);
  assert.equal(
    await cacheKey(serialized, DEFAULT_RULES),
    await cacheKey(serializeContent({ ...post, id: 'another-id' }), DEFAULT_RULES)
  );
  assert.notEqual(
    await cacheKey(serialized, DEFAULT_RULES),
    await cacheKey(serializeContent({ ...post, source: 'youtube', type: 'video' }), DEFAULT_RULES)
  );
});
