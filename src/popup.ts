import { mountScrollbars } from './shared/scrollbars';
import { send } from './shared/messages';
import type { Config, AppState } from './types';
import * as E from './shared/core';
import { element as $ } from './shared/dom';

function toast(message: string, kind = '') {
  const node = $('toast');
  node.textContent = message;
  node.className = `ew-toast ${kind || ''}`;
  setTimeout(() => node.classList.add('ew-hidden'), 2600);
}

function renderRules(config: Config) {
  const enabled = config.rules.filter((rule) => rule.enabled);
  $('ruleCount').textContent = String(enabled.length).padStart(2, '0');
  $('ruleList').replaceChildren(
    ...config.rules.map((rule) => {
      const row = document.createElement('div');
      row.className = 'ew-rule-row';
      const icon = document.createElement('span');
      icon.className = 'ew-rule-icon';
      icon.textContent = rule.builtin ? '◈' : '＋';
      const copy = document.createElement('span');
      copy.className = 'ew-rule-copy';
      const name = document.createElement('strong');
      name.className = 'ew-rule-name';
      name.textContent = rule.name;
      const meta = document.createElement('span');
      meta.className = 'ew-rule-meta';
      meta.textContent = rule.enabled ? rule.description : '规则已停用';
      copy.append(name, meta);
      const chip = document.createElement('span');
      chip.className = `ew-chip ${rule.enabled ? 'green' : ''}`;
      chip.textContent = rule.enabled ? `${Math.round(rule.threshold * 100)}%` : '已关闭';
      row.append(icon, copy, chip);
      row.style.opacity = rule.enabled ? '1' : '.55';
      return row;
    })
  );
}

function render(state: AppState) {
  const config = state.config;
  const stats = state.stats;
  $<HTMLInputElement>('enabledToggle').checked = config.enabled;
  $('shield').classList.toggle('off', !config.enabled || !state.hasApiKey);
  $('statusTitle').textContent = config.enabled ? '保护状态' : '保护已暂停';
  $('statusBadge').textContent = !state.hasApiKey
    ? '需要连接'
    : config.enabled
      ? '过滤中'
      : '已暂停';
  $('statusBadge').className = `ew-chip ${state.hasApiKey && config.enabled ? 'green' : 'amber'}`;
  $('checkedCount').textContent = String(stats.totalChecked || 0);
  $('hiddenCount').textContent = String(stats.totalHidden || 0);
  $('requestCount').textContent = String(stats.requests || 0);
  const apiStatus = $('apiStatus');
  apiStatus.replaceChildren();
  const dot = document.createElement('span');
  dot.className = `ew-dot ${state.hasApiKey ? '' : 'warn'}`;
  apiStatus.append(
    dot,
    document.createTextNode(
      state.hasApiKey
        ? ` TypeSafe 已连接${stats.latencyMs ? ` · ${stats.latencyMs}ms` : ''}`
        : ' 未连接 TypeSafe'
    )
  );
  $('connectPanel').classList.toggle('ew-hidden', state.hasApiKey);
  renderRules(config);
}

async function refresh() {
  const response = await send(E.MESSAGE.GET_STATE);
  if (response.ok) render(response);
}

$<HTMLInputElement>('enabledToggle').addEventListener('change', async () => {
  const response = await send(E.MESSAGE.SAVE_CONFIG, {
    enabled: $<HTMLInputElement>('enabledToggle').checked,
  });
  if (response.ok) {
    await refresh();
    toast($<HTMLInputElement>('enabledToggle').checked ? '保护已开启' : '保护已暂停', 'success');
  }
});

$<HTMLButtonElement>('settingsButton').addEventListener('click', () =>
  send(E.MESSAGE.OPEN_SETTINGS)
);
$<HTMLButtonElement>('onboardingButton').addEventListener('click', () =>
  send(E.MESSAGE.OPEN_ONBOARDING)
);

$<HTMLButtonElement>('saveKeyButton').addEventListener('click', async () => {
  const apiKey = $<HTMLInputElement>('apiKeyInput').value.trim();
  const message = $('connectMessage');
  message.classList.add('ew-hidden');
  if (!apiKey) {
    message.textContent = '请输入 API Key。';
    message.classList.remove('ew-hidden');
    return;
  }
  $<HTMLButtonElement>('saveKeyButton').disabled = true;
  $<HTMLButtonElement>('saveKeyButton').textContent = '测试中…';
  const test = await send(E.MESSAGE.TEST_CONNECTION, { apiKey });
  if (!test.ok) {
    message.textContent = `连接失败：${test.error || 'API_UNAVAILABLE'}。插件会保持放行。`;
    message.classList.remove('ew-hidden');
  } else {
    await send(E.MESSAGE.SAVE_API_KEY, { apiKey });
    await send(E.MESSAGE.SAVE_CONFIG, { onboardingCompleted: true });
    $<HTMLInputElement>('apiKeyInput').value = '';
    toast(`连接成功 · ${test.latencyMs}ms`, 'success');
    await refresh();
  }
  $<HTMLButtonElement>('saveKeyButton').disabled = false;
  $<HTMLButtonElement>('saveKeyButton').textContent = '连接';
});

refresh();

mountScrollbars();
