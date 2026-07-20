import { expect, test } from 'vitest';
import {
  boundsFromAlpha, compositeOpFor, opsPointCount, reduceOps,
  type SelectionOp
} from '../src/engine/selection-ops';

const rect = (x: number, y: number, w: number, h: number) =>
  ({ kind: 'rect', x, y, w, h }) as const;

test('a new-mode shape replaces the whole list', () => {
  const ops: SelectionOp[] = [
    { kind: 'shape', shape: rect(0, 0, 10, 10), mode: 'new' },
    { kind: 'shape', shape: rect(5, 5, 10, 10), mode: 'add' }
  ];
  const next = reduceOps(ops, { kind: 'shape', shape: rect(20, 20, 5, 5), mode: 'new' });
  expect(next.length).toBe(1);
  expect(next[0]).toEqual({ kind: 'shape', shape: rect(20, 20, 5, 5), mode: 'new' });
});

test('add, subtract, and intersect append to the list', () => {
  let ops: SelectionOp[] = [{ kind: 'shape', shape: rect(0, 0, 10, 10), mode: 'new' }];
  for (const mode of ['add', 'subtract', 'intersect'] as const) {
    ops = reduceOps(ops, { kind: 'shape', shape: rect(1, 1, 2, 2), mode });
  }
  expect(ops.length).toBe(4);
  expect(ops.map((o) => (o.kind === 'shape' ? o.mode : o.kind))).toEqual(['new', 'add', 'subtract', 'intersect']);
});

test('select-all resets the list and invert appends', () => {
  const ops: SelectionOp[] = [{ kind: 'shape', shape: rect(0, 0, 4, 4), mode: 'new' }];
  const all = reduceOps(ops, { kind: 'all' });
  expect(all).toEqual([{ kind: 'all' }]);
  const inverted = reduceOps(all, { kind: 'invert' });
  expect(inverted).toEqual([{ kind: 'all' }, { kind: 'invert' }]);
});

test('modes map to the documented composite operations', () => {
  expect(compositeOpFor('new')).toBe('source-over');
  expect(compositeOpFor('add')).toBe('source-over');
  expect(compositeOpFor('subtract')).toBe('destination-out');
  expect(compositeOpFor('intersect')).toBe('destination-in');
});

test('boundsFromAlpha finds the tight box and nulls when empty', () => {
  const w = 5, h = 4;
  const alpha = new Uint8Array(w * h);
  expect(boundsFromAlpha(alpha, w, h)).toBeNull();
  alpha[1 * w + 2] = 255;
  alpha[2 * w + 3] = 255;
  expect(boundsFromAlpha(alpha, w, h)).toEqual({ x: 2, y: 1, w: 2, h: 2 });
});

test('opsPointCount sizes history commands', () => {
  expect(opsPointCount([{ kind: 'all' }])).toBe(1);
  expect(opsPointCount([{ kind: 'shape', shape: rect(0, 0, 1, 1), mode: 'new' }])).toBe(4);
  expect(opsPointCount([
    { kind: 'shape', shape: { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }, mode: 'add' }
  ])).toBe(3);
});
