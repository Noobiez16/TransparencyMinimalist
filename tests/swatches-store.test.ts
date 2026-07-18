import { beforeEach, expect, test, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); }
});

const { DEFAULT_SWATCHES, loadSwatches, saveSwatches } = await import('../src/panels/swatches-panel');

beforeEach(() => store.clear());

test('missing storage yields the twelve defaults', () => {
  expect(loadSwatches()).toEqual(DEFAULT_SWATCHES);
  expect(DEFAULT_SWATCHES).toHaveLength(12);
});

test('saved swatches round-trip', () => {
  saveSwatches(['#111111', '#222222']);
  expect(loadSwatches()).toEqual(['#111111', '#222222']);
});

test('corrupt storage falls back to defaults', () => {
  store.set('transparency.swatches', '{nope');
  expect(loadSwatches()).toEqual(DEFAULT_SWATCHES);
  store.set('transparency.swatches', JSON.stringify(['red', 5]));
  expect(loadSwatches()).toEqual(DEFAULT_SWATCHES);
});
