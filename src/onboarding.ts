import { mountScrollbars } from './shared/scrollbars';
import { send } from './shared/messages';
import * as E from './shared/core';
import { element as $ } from './shared/dom';
let step = 0;
let selectedRules = E.clone(E.DEFAULT_RULES);

function showStep(next: number) {
  step = next;
  document
    .querySelectorAll<HTMLElement>('[data-step]')
    .forEach((node) => node.classList.toggle('active', Number(node.dataset.step) === step));
  document
    .querySelectorAll('.ew-stepper span')
    .forEach((node, index) => node.classList.toggle('active', index <= step));
}
function showError(message: string) {
  $('connectionStatus').textContent = message;
  $('connectionStatus').classList.remove('ew-hidden');
}
function renderRules() {
  $('onboardingRules').replaceChildren(
    ...selectedRules.map((rule) => {
      const label = document.createElement('label');
      label.className = 'ew-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.dataset.ruleId = rule.id;
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = rule.name;
      const desc = document.createElement('small');
      desc.textContent = rule.description;
      copy.append(title, desc);
      label.append(input, copy);
      return label;
    })
  );
}

$<HTMLButtonElement>('testConnectionButton').addEventListener('click', async () => {
  const key = $<HTMLInputElement>('onboardingKey').value.trim();
  if (!key) {
    showError('请先输入 API Key。');
    return;
  }
  $<HTMLButtonElement>('testConnectionButton').disabled = true;
  $<HTMLButtonElement>('testConnectionButton').textContent = '握手中…';
  const result = await send(E.MESSAGE.TEST_CONNECTION, { apiKey: key });
  $<HTMLButtonElement>('testConnectionButton').disabled = false;
  $<HTMLButtonElement>('testConnectionButton').textContent = '测试连接';
  if (!result.ok) {
    showError(`连接失败：${result.error || 'API_UNAVAILABLE'}。请检查 Key 后重试。`);
    return;
  }
  $('connectionStatus').className = 'ew-help ew-success';
  $('connectionStatus').textContent = `连接成功 · ${result.latencyMs}ms`;
});
$<HTMLButtonElement>('nextButton').addEventListener('click', async () => {
  const key = $<HTMLInputElement>('onboardingKey').value.trim();
  if (!key) {
    showError('请输入 TypeSafe API Key。');
    return;
  }
  const result = await send(E.MESSAGE.TEST_CONNECTION, { apiKey: key });
  if (!result.ok) {
    showError(`连接失败：${result.error || 'API_UNAVAILABLE'}。`);
    return;
  }
  await send(E.MESSAGE.SAVE_API_KEY, { apiKey: key });
  renderRules();
  showStep(1);
});
$<HTMLButtonElement>('backButton').addEventListener('click', () => showStep(0));
$<HTMLButtonElement>('finishButton').addEventListener('click', async () => {
  const enabledIds = new Set(
    Array.from(document.querySelectorAll<HTMLInputElement>('#onboardingRules input:checked')).map(
      (node) => node.dataset.ruleId
    )
  );
  const rules = selectedRules.map((rule) => ({ ...rule, enabled: enabledIds.has(rule.id) }));
  await send(E.MESSAGE.SAVE_CONFIG, { rules, enabled: true, onboardingCompleted: true });
  showStep(2);
});
$<HTMLButtonElement>('openSettingsButton').addEventListener('click', () =>
  send(E.MESSAGE.OPEN_SETTINGS)
);
$<HTMLButtonElement>('doneButton').addEventListener('click', () => window.close());
renderRules();

mountScrollbars();
