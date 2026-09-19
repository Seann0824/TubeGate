import type { ContentAdapter } from '../types';

function createRegistry() {
  const adapters = new Map<string, ContentAdapter>();
  function register(adapter: ContentAdapter) {
    if (!adapter || !/^[a-z][a-z0-9_-]{0,39}$/.test(adapter.id || ''))
      throw new TypeError('Adapter requires a stable id');
    for (const method of ['matches', 'getContext', 'collect', 'extract', 'isInScope'] as const) {
      if (typeof adapter[method] !== 'function')
        throw new TypeError(`Adapter ${adapter.id} is missing ${method}`);
    }
    if (adapters.has(adapter.id)) throw new Error(`Duplicate adapter: ${adapter.id}`);
    const registered = Object.freeze({ ...adapter });
    adapters.set(adapter.id, registered);
    return registered;
  }
  function resolve(url: string): ContentAdapter | null {
    const matches = [...adapters.values()].filter((adapter) => adapter.matches(url));
    if (matches.length > 1) throw new Error('Ambiguous adapter match');
    return matches[0] || null;
  }
  return { register, resolve, list: () => [...adapters.values()] };
}

export { createRegistry };
export const registry = createRegistry();
