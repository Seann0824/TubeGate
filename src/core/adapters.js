(function (root) {
  'use strict';

  function createRegistry() {
    const adapters = new Map();
    function register(adapter) {
      if (!adapter || !/^[a-z][a-z0-9_-]{0,39}$/.test(adapter.id || '')) throw new TypeError('Adapter requires a stable id');
      for (const method of ['matches', 'getContext', 'collect', 'extract', 'isInScope']) {
        if (typeof adapter[method] !== 'function') throw new TypeError(`Adapter ${adapter.id} is missing ${method}`);
      }
      if (adapters.has(adapter.id)) throw new Error(`Duplicate adapter: ${adapter.id}`);
      const registered = Object.freeze({ ...adapter });
      adapters.set(adapter.id, registered);
      return registered;
    }
    function resolve(url) {
      const matches = [...adapters.values()].filter((adapter) => adapter.matches(url));
      if (matches.length > 1) throw new Error('Ambiguous adapter match');
      return matches[0] || null;
    }
    return { register, resolve, list: () => [...adapters.values()] };
  }

  root.TubeGateAdapters = { createRegistry, ...createRegistry() };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TubeGateAdapters;
})(globalThis);
