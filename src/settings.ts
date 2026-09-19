import { mountScrollbars } from './shared/scrollbars';
import { send } from './shared/messages';
import type { Config, Rule, AppState } from './types';
import * as C from './core/content';
import * as P from './providers/jev-protocol';
import * as E from './shared/core';
import { element as $ } from './shared/dom';
let state: AppState;
let editingId: string | null = null;
let modalTrigger: HTMLElement | null = null;
const ruleExamples: Record<
  string,
  Pick<Rule, 'name' | 'description' | 'falseCriteria' | 'threshold'>
> = {
  politics: {
    name: '政治 / 时政',
    description:
      '隐藏以当代政治、政党、选举、政治人物、政府政策争论或国际政治冲突为主要话题的内容，不区分国家或立场。',
    falseCriteria:
      '保留历史知识、政治学基础课程，以及仅顺带提到政治人物或国家名称、主要内容并非时政的内容。',
    threshold: 0.8,
  },
  gaming: {
    name: '游戏实况',
    description: '隐藏以电子游戏实况、游戏直播剪辑、对局解说或游戏攻略为主要内容的帖子或视频。',
    falseCriteria: '保留游戏开发、编程教学和计算机图形学课程。',
    threshold: 0.8,
  },
  entertainment: {
    name: '娱乐八卦',
    description: '隐藏以明星绯闻、私人感情、粉丝争吵或娱乐圈爆料为主要话题的内容。',
    falseCriteria: '保留作品分析、影评、音乐表演和正式人物访谈。',
    threshold: 0.8,
  },
};

function showToast(message: string, kind = '') {
  const node = $('toast');
  node.textContent = message;
  node.className = `ew-toast ${kind || ''}`;
  setTimeout(() => node.classList.add('ew-hidden'), 2500);
}

async function persist(patch: Partial<Config>) {
  const response = await send(E.MESSAGE.SAVE_CONFIG, patch);
  if (!response.ok) {
    showToast(`保存失败：${response.error || 'UNKNOWN_ERROR'}`, 'error');
    return false;
  }
  await refresh();
  showToast('已保存到本地', 'success');
  return true;
}

function createRuleCard(rule: Rule) {
  const card = document.createElement('div');
  card.className = 'ew-rule-card';
  const copy = document.createElement('div');
  copy.className = 'ew-rule-card-copy';
  const title = document.createElement('div');
  title.className = 'ew-rule-card-title';
  const name = document.createElement('span');
  name.textContent = rule.name;
  title.append(name);
  const kind = document.createElement('span');
  kind.className = 'ew-chip';
  kind.textContent = rule.builtin ? '内置' : '自定义';
  title.append(kind);
  const threshold = document.createElement('span');
  threshold.className = `ew-chip ${rule.threshold < 0.7 ? 'amber' : ''}`;
  threshold.textContent = `阈值 ${Math.round(rule.threshold * 100)}%`;
  title.append(threshold);
  const desc = document.createElement('div');
  desc.className = 'ew-rule-card-desc';
  desc.textContent = rule.description;
  copy.append(title, desc);
  const actions = document.createElement('div');
  actions.className = 'ew-rule-actions';
  const edit = document.createElement('button');
  edit.className = 'ew-button ghost small';
  edit.textContent = '编辑';
  edit.addEventListener('click', () => openRuleModal(rule));
  actions.append(edit);
  if (!rule.builtin) {
    const remove = document.createElement('button');
    remove.className = 'ew-button danger small';
    remove.textContent = '删除';
    remove.addEventListener('click', async () => {
      if (window.confirm(`删除规则“${rule.name}”？`))
        await persist({ rules: state.config.rules.filter((item) => item.id !== rule.id) });
    });
    actions.append(remove);
  }
  const toggle = document.createElement('label');
  toggle.className = 'ew-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = rule.enabled;
  input.setAttribute('aria-label', `启用规则：${rule.name}`);
  const track = document.createElement('span');
  toggle.append(input, track);
  input.addEventListener('change', async () => {
    const rules = state.config.rules.map((item) =>
      item.id === rule.id ? { ...item, enabled: input.checked } : item
    );
    await persist({ rules });
  });
  actions.append(toggle);
  card.append(copy, actions);
  return card;
}

function renderRules() {
  const list = $('settingsRuleList');
  list.replaceChildren(...state.config.rules.map(createRuleCard));
  const active = state.config.rules.filter((rule) => rule.enabled).length;
  $('sideRuleCount').textContent = `${active} 活跃`;
}

function render() {
  const config = state.config;
  const stats = state.stats;
  $('headerStatus').innerHTML = state.hasApiKey
    ? '<span class="ew-dot"></span> 防护已就绪'
    : '<span class="ew-dot warn"></span> 需要 API Key';
  $<HTMLInputElement>('enabledToggle').checked = config.enabled;
  $<HTMLInputElement>('recommendationsOnlyToggle').checked = config.recommendationsOnly;
  $<HTMLInputElement>('failOpenToggle').checked = config.failOpen;
  $<HTMLInputElement>('placeholderToggle').checked = config.showPlaceholder;
  $<HTMLInputElement>('checkControlsToggle').checked = config.showCheckControls;
  $<HTMLInputElement>('confidenceToggle').checked = config.showConfidence;
  $<HTMLInputElement>('preloadToggle').checked = config.preload;
  $<HTMLInputElement>('debugToggle').checked = config.debug;
  $<HTMLInputElement>('apiKeyField').value = state.apiKeyMask || '';
  $('apiBadge').textContent = state.hasApiKey
    ? `已连接${stats.latencyMs ? ` · ${stats.latencyMs}ms` : ''}`
    : '尚未连接';
  $('apiBadge').className = `ew-chip ${state.hasApiKey ? 'green' : 'amber'}`;
  $('sideHiddenCount').textContent = String(stats.hidden || 0);
  $('quotaLabel').textContent =
    `${(stats.requests || 0).toLocaleString()} / ${(config.dailyLimit || 0).toLocaleString()}`;
  $('quotaProgress').style.width =
    `${Math.min(100, ((stats.requests || 0) / Math.max(1, config.dailyLimit)) * 100)}%`;
  $<HTMLSelectElement>('concurrencySelect').value = String(config.maxConcurrency);
  $<HTMLInputElement>('dailyLimitInput').value = String(config.dailyLimit);
  $<HTMLSelectElement>('cacheTtlSelect').value = String(config.cacheTtlHours);
  $('requestPreview').textContent = JSON.stringify(
    {
      model: config.model,
      state: {
        content: C.serializeContent({
          source: 'youtube',
          id: 'preview',
          type: 'video',
          title: '<视频标题>',
          author: '<频道名>',
          text: '<卡片描述>',
        }),
      },
      questions: P.buildQuestions(E.activeRules(config)),
    },
    null,
    2
  );
  renderRules();
}

async function refresh() {
  const response = await send(E.MESSAGE.GET_STATE);
  if (response.ok) {
    state = response;
    render();
  }
}

function openRuleModal(
  rule?: Rule | null,
  example?: Pick<Rule, 'name' | 'description' | 'falseCriteria' | 'threshold'>
) {
  modalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  editingId = rule ? rule.id : null;
  $('modalTitle').textContent = rule ? `编辑规则 · ${rule.name}` : '添加自定义过滤规则';
  const draft = rule || example;
  $<HTMLInputElement>('ruleName').value = draft ? draft.name : '';
  $<HTMLTextAreaElement>('ruleDescription').value = draft ? draft.description : '';
  $<HTMLTextAreaElement>('ruleFalseCriteria').value = draft ? draft.falseCriteria || '' : '';
  $<HTMLInputElement>('ruleThreshold').value = String(
    draft ? Math.round(draft.threshold * 100) : 80
  );
  $('thresholdValue').textContent = `${$<HTMLInputElement>('ruleThreshold').value}%`;
  $<HTMLInputElement>('ruleName').readOnly = false;
  $<HTMLTextAreaElement>('ruleDescription').readOnly = false;
  $<HTMLTextAreaElement>('ruleFalseCriteria').readOnly = false;
  $('modalBackdrop').classList.remove('ew-hidden');
  $<HTMLInputElement>('ruleName').focus();
}

function closeRuleModal() {
  $('modalBackdrop').classList.add('ew-hidden');
  editingId = null;
  modalTrigger?.focus();
}

$<HTMLInputElement>('enabledToggle').addEventListener('change', () =>
  persist({ enabled: $<HTMLInputElement>('enabledToggle').checked })
);
$<HTMLInputElement>('placeholderToggle').addEventListener('change', () =>
  persist({ showPlaceholder: $<HTMLInputElement>('placeholderToggle').checked })
);
$<HTMLInputElement>('checkControlsToggle').addEventListener('change', () =>
  persist({ showCheckControls: $<HTMLInputElement>('checkControlsToggle').checked })
);
$<HTMLInputElement>('confidenceToggle').addEventListener('change', () =>
  persist({ showConfidence: $<HTMLInputElement>('confidenceToggle').checked })
);
$<HTMLInputElement>('preloadToggle').addEventListener('change', () =>
  persist({ preload: $<HTMLInputElement>('preloadToggle').checked })
);
$<HTMLInputElement>('debugToggle').addEventListener('change', () =>
  persist({ debug: $<HTMLInputElement>('debugToggle').checked })
);
$<HTMLSelectElement>('concurrencySelect').addEventListener('change', () =>
  persist({ maxConcurrency: Number($<HTMLSelectElement>('concurrencySelect').value) })
);
$<HTMLInputElement>('dailyLimitInput').addEventListener('change', () =>
  persist({ dailyLimit: Number($<HTMLInputElement>('dailyLimitInput').value) })
);
$<HTMLSelectElement>('cacheTtlSelect').addEventListener('change', () =>
  persist({ cacheTtlHours: Number($<HTMLSelectElement>('cacheTtlSelect').value) })
);
$<HTMLInputElement>('ruleThreshold').addEventListener('input', () => {
  $('thresholdValue').textContent = `${$<HTMLInputElement>('ruleThreshold').value}%`;
});
$<HTMLButtonElement>('addRuleButton').addEventListener('click', () => openRuleModal());
$<HTMLButtonElement>('closeModalButton').addEventListener('click', closeRuleModal);
$<HTMLButtonElement>('cancelRuleButton').addEventListener('click', closeRuleModal);
$('modalBackdrop').addEventListener('click', (event) => {
  if (event.target === $('modalBackdrop')) closeRuleModal();
});
document
  .querySelectorAll<HTMLElement>('[data-rule-example]')
  .forEach((button) =>
    button.addEventListener('click', () =>
      openRuleModal(null, ruleExamples[button.dataset.ruleExample || ''])
    )
  );
$<HTMLFormElement>('ruleForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $<HTMLInputElement>('ruleName').value.trim();
  const description = $<HTMLTextAreaElement>('ruleDescription').value.trim();
  const falseCriteria = $<HTMLTextAreaElement>('ruleFalseCriteria').value.trim();
  const threshold = Number($<HTMLInputElement>('ruleThreshold').value) / 100;
  if (!name || !description) return;
  let rules;
  if (editingId)
    rules = state.config.rules.map((rule) =>
      rule.id === editingId
        ? {
            ...rule,
            name,
            description,
            trueCriteria: description,
            falseCriteria,
            threshold,
            instructions:
              '仅根据标题、作者与正文或描述判断 `content` 是否符合以下过滤条件：' +
              description +
              '。不要推测画面。',
          }
        : rule
    );
  else {
    const id = `custom_${Date.now().toString(36)}`;
    rules = [
      ...state.config.rules,
      {
        id,
        name,
        description,
        instructions:
          '仅根据标题、作者与正文或描述判断 `content` 是否符合以下过滤条件：' +
          description +
          '。不要推测画面。',
        trueCriteria: description,
        falseCriteria,
        threshold,
        enabled: true,
        builtin: false,
      },
    ];
  }
  if (await persist({ rules })) closeRuleModal();
});

$<HTMLButtonElement>('testKeyButton').addEventListener('click', async () => {
  const message = $('apiMessage');
  message.classList.add('ew-hidden');
  const result = await send(E.MESSAGE.TEST_CONNECTION);
  if (result.ok) {
    showToast(`连接成功 · ${result.latencyMs}ms`, 'success');
  } else {
    message.textContent = `连接失败：${result.error || 'API_UNAVAILABLE'}`;
    message.classList.remove('ew-hidden');
  }
});
let editingKey = false;
$<HTMLButtonElement>('changeKeyButton').addEventListener('click', async () => {
  const field = $<HTMLInputElement>('apiKeyField');
  if (!editingKey) {
    editingKey = true;
    field.readOnly = false;
    field.value = '';
    field.placeholder = 'apikey_…';
    field.focus();
    $<HTMLButtonElement>('changeKeyButton').textContent = '保存';
    return;
  }
  const key = field.value.trim();
  const result = await send(E.MESSAGE.TEST_CONNECTION, { apiKey: key });
  if (!result.ok) {
    $('apiMessage').textContent = `连接失败：${result.error || 'API_UNAVAILABLE'}`;
    $('apiMessage').classList.remove('ew-hidden');
    return;
  }
  await send(E.MESSAGE.SAVE_API_KEY, { apiKey: key });
  await send(E.MESSAGE.SAVE_CONFIG, { onboardingCompleted: true });
  editingKey = false;
  field.readOnly = true;
  $<HTMLButtonElement>('changeKeyButton').textContent = '更换';
  showToast('新 API Key 已保存', 'success');
  await refresh();
});
$<HTMLButtonElement>('revokeKeyButton').addEventListener('click', async () => {
  if (!window.confirm('删除本地 TypeSafe API Key？删除后插件将保持放行。')) return;
  await send(E.MESSAGE.SAVE_API_KEY, { apiKey: '' });
  showToast('API Key 已从本地删除', 'success');
  await refresh();
});
$<HTMLButtonElement>('clearCacheButton').addEventListener('click', async () => {
  await send(E.MESSAGE.CLEAR_CACHE);
  showToast('分类缓存已清除，刷新 YouTube 或 X 页面后重新检查', 'success');
});
$<HTMLButtonElement>('saveAllButton').addEventListener('click', () =>
  showToast('当前配置已实时同步到浏览器本地存储', 'success')
);
$<HTMLButtonElement>('exportButton').addEventListener('click', () => {
  const safe = E.sanitizeConfig(state.config);
  const blob = new Blob(
    [JSON.stringify({ exportedAt: new Date().toISOString(), config: safe }, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tubegate-config.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('已导出（不包含 API Key）', 'success');
});
document.querySelectorAll<HTMLElement>('[data-target]').forEach((button) =>
  button.addEventListener('click', () => {
    document
      .getElementById(button.dataset.target || '')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document
      .querySelectorAll<HTMLElement>('[data-target]')
      .forEach((node) => node.classList.toggle('active', node === button));
  })
);
refresh();

// Keep keyboard focus inside the editor and restore it to the opening control.
document.addEventListener('keydown', (event) => {
  const modal = $('modalBackdrop');
  if (modal.classList.contains('ew-hidden')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeRuleModal();
  }
  if (event.key !== 'Tab') return;
  const controls = Array.from(
    modal.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'
    )
  );
  const first = controls[0],
    last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});

mountScrollbars();
