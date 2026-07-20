import { expect, test } from 'vitest';
import { traceContours } from '../src/engine/selection-contour';

/** Build an alpha grid from an ASCII map ('#' = selected). */
function grid(rows: string[]): { alpha: Uint8Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const alpha = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { alpha[y * w + x] = ch === '#' ? 255 : 0; }));
  return { alpha, w, h };
}

function loopKey(loop: { x: number; y: number }[]): string {
  return loop.map((p) => `${p.x},${p.y}`).sort().join(' ');
}

test('an empty grid has no contours', () => {
  const { alpha, w, h } = grid(['...', '...', '...']);
  expect(traceContours(alpha, w, h)).toEqual([]);
});

test('a single pixel yields one four-corner loop', () => {
  const { alpha, w, h } = grid(['...', '.#.', '...']);
  const loops = traceContours(alpha, w, h);
  expect(loops.length).toBe(1);
  expect(loopKey(loops[0])).toBe(loopKey([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }]));
});

test('a rectangle collapses collinear points to four corners', () => {
  const { alpha, w, h } = grid(['.....', '.###.', '.###.', '.....']);
  const loops = traceContours(alpha, w, h);
  expect(loops.length).toBe(1);
  expect(loops[0].length).toBe(4);
  expect(loopKey(loops[0])).toBe(loopKey([{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 1, y: 3 }]));
});

test('a shape with a hole yields an outer and an inner loop', () => {
  const { alpha, w, h } = grid(['.....', '.###.', '.#.#.', '.###.', '.....']);
  const loops = traceContours(alpha, w, h);
  expect(loops.length).toBe(2);
  expect(loops.some((l) => l.length === 4 && loopKey(l) === loopKey([{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }]))).toBe(true);
  expect(loops.some((l) => loopKey(l) === loopKey([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 3 }]))).toBe(true);
});

test('two disjoint blobs yield two loops', () => {
  const { alpha, w, h } = grid(['#..#', '#..#', '....']);
  const loops = traceContours(alpha, w, h);
  expect(loops.length).toBe(2);
});

test('pixels touching the grid edge still close their loop', () => {
  const { alpha, w, h } = grid(['##', '##']);
  const loops = traceContours(alpha, w, h);
  expect(loops.length).toBe(1);
  expect(loops[0].length).toBe(4);
});
