import { expect, test } from 'vitest';
import { clampRect, stampBounds, stampPoints, unionRects } from '../src/engine/stroke-geometry';

test('stampPoints steps by spacing and always ends on the target', () => {
  const pts = stampPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
  expect(pts[pts.length - 1]).toEqual({ x: 10, y: 0 });
  expect(pts.length).toBe(3); // 4, 8, 10
  expect(pts[0].x).toBeCloseTo(4);
  expect(stampPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 4)).toEqual([]);
});

test('stampBounds expands to integers with a 1px guard', () => {
  expect(stampBounds({ x: 10.4, y: 20.6 }, 5)).toEqual({ x: 4, y: 14, w: 13, h: 13 });
});

test('unionRects grows to cover both', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 5, y: 8, w: 10, h: 10 };
  expect(unionRects(a, b)).toEqual({ x: 0, y: 0, w: 15, h: 18 });
  expect(unionRects(null, b)).toEqual(b);
});

test('clampRect intersects with the bitmap and nulls when outside', () => {
  expect(clampRect({ x: -5, y: -5, w: 20, h: 8 }, 100, 100)).toEqual({ x: 0, y: 0, w: 15, h: 3 });
  expect(clampRect({ x: 200, y: 0, w: 10, h: 10 }, 100, 100)).toBeNull();
  expect(clampRect({ x: 90, y: 90, w: 40, h: 40 }, 100, 100)).toEqual({ x: 90, y: 90, w: 10, h: 10 });
});
