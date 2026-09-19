import { createDefaultConfig, normalizeConfig, normalizeRule } from '../src/shared/core';
import type { AppState, Message, MessageSuccesses, Failure } from '../src/types';

// Development-only fixture. Never included in the extension package; never calls an API.
let config = normalizeConfig({
  ...createDefaultConfig(),
  rules: [
    normalizeRule({
      id: 'demo_politics',
      name: '政治 / 时政',
      description: '隐藏以选举、政党争论或国际政治冲突为主要话题的视频。',
      falseCriteria: '保留历史知识和政治学课程。',
      threshold: 0.8,
    }),
    ...createDefaultConfig().rules,
  ],
});
const state = (): AppState => ({
  config,
  hasApiKey: true,
  needsOnboarding: false,
  apiKeyMask: '演示数据',
  stats: {
    day: 'preview',
    requests: 0,
    checked: 0,
    hidden: 0,
    totalChecked: 0,
    totalHidden: 0,
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
  },
});
Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    runtime: {
      sendMessage(
        message: Message,
        callback: (response: MessageSuccesses[keyof MessageSuccesses] | Failure) => void
      ) {
        switch (message.type) {
          case 'GET_STATE':
            callback({ ok: true, ...state() });
            return;
          case 'SAVE_CONFIG':
            config = normalizeConfig({ ...config, ...message.payload });
            callback({ ok: true, config });
            return;
          case 'OPEN_SETTINGS':
            location.href = '/src/settings.html';
            callback({ ok: true });
            return;
          case 'OPEN_ONBOARDING':
            location.href = '/src/onboarding.html';
            callback({ ok: true });
            return;
          case 'CLEAR_CACHE':
            callback({ ok: true });
            return;
          default:
            callback({ ok: false, error: '设计预览不连接 API，请在扩展中操作' });
        }
      },
    },
  },
});
const banner = document.createElement('div');
banner.textContent = '设计预览 · 示例规则 · 修改仅在本页有效';
banner.style.cssText =
  'padding:8px 16px;text-align:center;background:#e8ede0;color:#50604b;font:11px/1.5 system-ui';
document.body.prepend(banner);
