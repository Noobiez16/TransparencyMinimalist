import { expect, test } from 'vitest';
import { bezierPointAt, hitTestAnchor, hitTestHandle, hitTestSegment } from '../src/engine/path-geometry';
import type { Anchor, SubPath } from '../src/engine/path-model';

const corner = (x: number, y: number): Anchor => ({ x, y, inDx: 0, inDy: 0, outDx: 0, outDy: 0 });
const square: SubPath = { anchors: [corner(0, 0), corner(100, 0), corner(100, 100)], closed: false };

test('hitTestAnchor finds the nearest anchor inside the radius', () => {
  expect(hitTestAnchor([square], { x: 2, y: 2 }, 6)).toEqual({ sub: 0, anchor: 0 });
  expect(hitTestAnchor([square], { x: 98, y: 3 }, 6)).toEqual({ sub: 0, anchor: 1 });
  expect(hitTestAnchor([square], { x: 50, y: 50 }, 6)).toBeNull();
});

test('hitTestHandle only grabs the selected anchor handles', () => {
  const sp: SubPath = {
    anchors: [{ x: 0, y: 0, inDx: 0, inDy: 0, outDx: 40, outDy: 0 }, corner(100, 0)],
    closed: false
  };
  expect(hitTestHandle([sp], { x: 40, y: 0 }, 6, null)).toBeNull();
  expect(hitTestHandle([sp], { x: 40, y: 0 }, 6, { sub: 0, anchor: 0 }))
    .toEqual({ sub: 0, anchor: 0, which: 'out' });
  expect(hitTestHandle([sp], { x: 90, y: 0 }, 6, { sub: 0, anchor: 0 })).toBeNull();
});

test('hitTestSegment finds a point on a straight segment', () => {
  const hit = hitTestSegment([square], { x: 50, y: 1 }, 6);
  expect(hit?.sub).toBe(0);
  expect(hit?.segment).toBe(0);
  expect(hit?.t).toBeCloseTo(0.5, 1);
  expect(hitTestSegment([square], { x: 50, y: 60 }, 6)).toBeNull();
});

test('hitTestSegment covers the closing segment of a closed subpath', () => {
  const closed: SubPath = { anchors: [corner(0, 0), corner(100, 0), corner(100, 100)], closed: true };
  const hit = hitTestSegment([closed], { x: 50, y: 50 }, 8);   // on the diagonal closing edge
  expect(hit?.segment).toBe(2);
});

test('bezierPointAt returns the curve midpoint', () => {
  const from: Anchor = { x: 0, y: 0, inDx: 0, inDy: 0, outDx: 0, outDy: 100 };
  const to: Anchor = { x: 100, y: 0, inDx: 0, inDy: 100, outDx: 0, outDy: 0 };
  const mid = bezierPointAt(from, to, 0.5);
  expect(mid.x).toBeCloseTo(50, 6);
  expect(mid.y).toBeCloseTo(75, 6);
  expect(bezierPointAt(from, to, 0)).toEqual({ x: 0, y: 0 });
});
