import assert from 'node:assert/strict';
import type { StorageArea } from '../src/types';

export function createArea(): StorageArea & { values: Record<string, unknown> } {
  const values: Record<string, unknown> = {};
  return {
    values,
    get(key, done) {
      done(structuredClone({ [key]: values[key] }));
    },
    set(patch, done) {
      Object.assign(values, structuredClone(patch));
      done();
    },
    remove(key, done) {
      delete values[key];
      done();
    },
  };
}
export function success<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  assert.equal(result.ok, true);
  return result as Extract<T, { ok: true }>;
}
export function failure<T extends { ok: boolean }>(result: T): Extract<T, { ok: false }> {
  assert.equal(result.ok, false);
  return result as Extract<T, { ok: false }>;
}
