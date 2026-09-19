(function () {
  'use strict';
  const E = globalThis.SocialMediaGate;
  const C = globalThis.TubeGateContent;
  const adapter = globalThis.TubeGateAdapters.resolve(location.href);
  if (!adapter) return;
  const itemLabel = adapter.itemLabel || '内容';
  const OWN = '[data-smg-ui]';
  const entries = new Map();
  const results = new Map();
  const revealed = new Set();
  let config = null;
  let hasKey = false;
  let context = adapter.getContext(location.href);
  let generation = 0;
  let navigating = false;
  let active = 0;
  let scanTimer;
  let refreshing = false;
  let status;

  function send(type, payload) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: 'RESPONSE_TIMEOUT' }), 60000);
      try {
        chrome.runtime.sendMessage({ type, payload }, (response) => {
          clearTimeout(timer);
          const error = chrome.runtime.lastError;
          resolve(error ? { ok: false, error: 'RUNTIME_UNAVAILABLE' } : response || { ok: false, error: 'NO_RESPONSE' });
        });
      } catch (_) {
        clearTimeout(timer);
        resolve({ ok: false, error: 'RUNTIME_UNAVAILABLE' });
      }
    });
  }

  function node(tag, className, text) {
    const result = document.createElement(tag);
    result.className = className;
    if (text) result.textContent = text;
    return result;
  }

  function readContent(card) {
    try {
      const extracted = adapter.extract(card, context);
      if (!extracted) return null;
      const item = C.normalizeContent(extracted);
      if (item.source !== adapter.id) return null;
      return { ...item, key: C.revision(item), identity: C.identity(item) };
    } catch (_) { return null; }
  }

  function inScope(card) {
    if (!context || navigating || !card.isConnected) return false;
    try { return adapter.isInScope(card, context); } catch (_) { return false; }
  }

  function clear(entry) {
    entry.card.classList.remove('smg-blocked', 'smg-pending');
    entry.placeholder?.remove();
    entry.controls?.remove();
    entry.placeholder = null;
    entry.controls = null;
  }

  function forgetAll() {
    generation += 1;
    for (const entry of entries.values()) clear(entry);
    entries.clear();
    results.clear();
    revealed.clear();
    renderStatus();
  }

  function allowed() {
    return context && !navigating && config?.enabled && hasKey && E.activeRules(config).length > 0;
  }

  function renderStatus() {
    if (!status) return;
    status.root.hidden = !context || navigating;
    const values = Array.from(results.values());
    const hidden = Array.from(entries.values()).filter((entry) => entry.card.classList.contains('smg-blocked')).length;
    const errors = values.filter((value) => value && !value.pending && !value.ok).length;
    status.button.textContent = !config?.enabled ? `${itemLabel}过滤已暂停` : !hasKey ? `${itemLabel}过滤 · 需要 API Key` : !E.activeRules(config).length ? `${itemLabel}过滤 · 没有启用的规则` : `${itemLabel}过滤 · 已检查 ${values.filter((value) => !value.pending).length} · 隐藏 ${hidden}${active ? ' · 检查中' : ''}${errors ? ` · 失败 ${errors}` : ''}`;
    status.button.title = `打开过滤设置；检查失败的${itemLabel}保持显示`;
  }

  function reveal(entry) {
    revealed.add(entry.item.identity);
    for (const candidate of entries.values()) {
      if (candidate.item.identity === entry.item.identity) renderEntry(candidate);
    }
    renderStatus();
  }

  function renderEntry(entry) {
    clear(entry);
    if (!allowed() || !inScope(entry.card)) return;
    const result = results.get(entry.item.key);
    const isRevealed = revealed.has(entry.item.identity);
    if (result?.pending && config.preload && !isRevealed) entry.card.classList.add('smg-pending');
    if (result?.ok && result.shouldHide && !isRevealed) {
      // Keep the original card as the grid/flex item; hide only its contents.
      // Adapters supply stable card roots whose direct children can be hidden.
      const placeholder = node('div', `smg-placeholder${config.showPlaceholder ? '' : ' smg-compact'}`);
      placeholder.dataset.smgUi = 'true';
      placeholder.setAttribute('role', 'status');
      const title = node('strong', '', `已屏蔽一个${itemLabel}`);
      const details = node('span', 'smg-reasons', result.matches.map((match) => `${match.name}${config.showConfidence ? ` · ${Math.round(match.probability * 100)}%` : ''}`).join(' / '));
      const restore = node('button', '', '恢复显示');
      restore.type = 'button';
      restore.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); reveal(entry); });
      placeholder.append(title);
      if (config.showPlaceholder) placeholder.append(details);
      placeholder.append(restore);
      entry.placeholder = placeholder;
      entry.card.appendChild(placeholder);
      entry.card.classList.add('smg-blocked');
      return;
    }
    if (!config.showCheckControls) return;
    const controls = node('div', 'smg-controls');
    controls.dataset.smgUi = 'true';
    const label = result?.pending ? '检查中…' : isRevealed ? '已恢复 · 重新检查' : result && !result.ok ? '检查失败 · 重试' : result ? '已放行 · 重新检查' : `检查${itemLabel}`;
    const button = node('button', '', label);
    button.type = 'button';
    button.disabled = Boolean(result?.pending);
    button.title = result?.error || `按当前过滤规则检查这条${itemLabel}`;
    button.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      if (active >= config.maxConcurrency) return;
      revealed.delete(entry.item.identity);
      inspect(entry, true);
    });
    controls.append(button);
    entry.controls = controls;
    entry.card.appendChild(controls);
  }

  function nearViewport(card) {
    const rect = card.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= -300 && rect.top <= innerHeight + 600;
  }

  async function inspect(entry, force = false) {
    if (!allowed() || !inScope(entry.card)) return;
    const key = entry.item.key;
    if (results.get(key)?.pending || (!force && results.has(key))) return;
    const epoch = generation;
    results.set(key, { pending: true });
    active += 1;
    renderEntry(entry);
    renderStatus();
    void send(E.MESSAGE.RECORD_CONTENT_EVENT, { action: 'checked' });
    const response = await send(E.MESSAGE.CLASSIFY_CONTENT, { content: C.normalizeContent(entry.item), force });
    active -= 1;
    if (adapter.getContext(location.href)?.key !== context?.key) routeChanged();
    // A response belongs to the settings and route it was requested under.
    if (epoch !== generation || !allowed()) { scheduleScan(); return; }
    results.set(key, response);
    let hidden = false;
    for (const candidate of entries.values()) {
      if (candidate.item.key !== key || !inScope(candidate.card)) continue;
      const current = readContent(candidate.card);
      if (!current || current.key !== key) { clear(candidate); entries.delete(candidate.card); continue; }
      renderEntry(candidate);
      hidden ||= candidate.card.classList.contains('smg-blocked');
    }
    if (hidden) void send(E.MESSAGE.RECORD_CONTENT_EVENT, { action: 'hidden' });
    renderStatus();
    scheduleScan();
  }

  function scan() {
    scanTimer = null;
    const nextContext = adapter.getContext(location.href);
    if (nextContext?.key !== context?.key) { context = nextContext; forgetAll(); }
    if (!context || navigating || !config) return;
    for (const [card, entry] of entries) {
      if (!inScope(card)) { clear(entry); entries.delete(card); }
    }
    for (const card of adapter.collect(document, context)) {
      if (!inScope(card)) continue;
      const item = readContent(card);
      const previous = entries.get(card);
      if (!item) { if (previous) { clear(previous); entries.delete(card); } continue; }
      let entry = previous;
      if (!entry || entry.item.key !== item.key || (entry.placeholder && !card.contains(entry.placeholder)) || (entry.controls && !card.contains(entry.controls))) {
        if (entry) clear(entry);
        entry = { card, item };
        entries.set(card, entry);
        renderEntry(entry);
      }
      if (!allowed() || revealed.has(item.identity) || results.has(item.key) || active >= config.maxConcurrency || !nearViewport(card)) continue;
      void inspect(entry);
    }
    // Bound retained results during long infinite-scroll sessions.
    if (results.size > 1000) {
      const liveKeys = new Set(Array.from(entries.values(), (entry) => entry.item.key));
      for (const [key, result] of results) {
        if (!result.pending && !liveKeys.has(key)) results.delete(key);
        if (results.size <= 800) break;
      }
    }
    renderStatus();
  }

  function scheduleScan() {
    if (!scanTimer) scanTimer = setTimeout(scan, 150);
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    const response = await send(E.MESSAGE.GET_STATE);
    refreshing = false;
    if (!response.ok || !response.config) return;
    if (JSON.stringify(config) === JSON.stringify(response.config) && hasKey === response.hasApiKey) return;
    config = response.config;
    hasKey = response.hasApiKey;
    forgetAll();
    scheduleScan();
  }

  function routeChanged() {
    const next = adapter.getContext(location.href);
    if (next?.key !== context?.key) { context = next; forgetAll(); }
    scheduleScan();
  }

  const root = node('aside', 'smg-status');
  root.dataset.smgUi = 'true';
  const button = node('button', '', `${itemLabel}过滤`);
  button.type = 'button';
  button.addEventListener('click', () => { void send(E.MESSAGE.OPEN_SETTINGS); });
  root.append(button);
  document.body.append(root);
  status = { root, button };
  renderStatus();
  const own = (target) => (target.nodeType === 1 ? target : target.parentElement)?.closest(OWN);
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => !own(mutation.target) && (mutation.type !== 'childList' || [...mutation.addedNodes, ...mutation.removedNodes].some((item) => !own(item))))) scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: adapter.observedAttributes || ['href', 'hidden'] });
  for (const event of adapter.navigation?.start || []) document.addEventListener(event, () => { navigating = true; forgetAll(); });
  for (const event of adapter.navigation?.finish || []) document.addEventListener(event, () => { navigating = false; routeChanged(); renderStatus(); });
  window.addEventListener('popstate', routeChanged);
  window.addEventListener('scroll', scheduleScan, { passive: true, capture: true });
  window.addEventListener('resize', scheduleScan, { passive: true });
  setInterval(routeChanged, 1000);
  setInterval(refresh, 3000);
  void refresh();
})();
