import { expect, test } from 'vitest';
import {
  bezierPointAt, deleteAnchor, insertAnchorOnSegment, moveAnchor, moveHandle,
  pathBounds, setAnchorCorner, setAnchorSmooth, translateSubPath
} from '../src/engine/path-geometry';
import type { Anchor, SubPath } from '../src/engine/path-model';

const corner = (x: number, y: number): Anchor => ({ x, y, inDx: 0, inDy: 0, outDx: 0, outDy: 0 });

test('inserting an anchor does not change the curve shape', () => {
  const from: Anchor = { x: 0, y: 0, inDx: 0, inDy: 0, outDx: 0, outDy: 100 };
  const to: Anchor = { x: 100, y: 0, inDx: 0, inDy: 100, outDx: 0, outDy: 0 };
  const before: SubPath[] = [{ anchors: [from, to], closed: false }];
  const midBefore = bezierPointAt(from, to, 0.5);

  const after = insertAnchorOnSegment(before, { sub: 0, segment: 0, t: 0.5, point: midBefore });
  expect(after[0].anchors.length).toBe(3);
  // The new anchor sits exactly on the original curve...
  expect(after[0].anchors[1].x).toBeCloseTo(midBefore.x, 6);
  expect(after[0].anchors[1].y).toBeCloseTo(midBefore.y, 6);
  // ...and each new half still passes through the original quarter points.
  const quarterBefore = bezierPointAt(from, to, 0.25);
  const quarterAfter = bezierPointAt(after[0].anchors[0], after[0].anchors[1], 0.5);
  expect(quarterAfter.x).toBeCloseTo(quarterBefore.x, 6);
  expect(quarterAfter.y).toBeCloseTo(quarterBefore.y, 6);
  // the input is untouched
  expect(before[0].anchors.length).toBe(2);
});

test('deleting an anchor removes it and leaves the rest', () => {
  const subs: SubPath[] = [{ anchors: [corner(0, 0), corner(50, 0), corner(100, 0)], closed: false }];
  const after = deleteAnchor(subs, { sub: 0, anchor: 1 });
  expect(after[0].anchors.map((a) => a.x)).toEqual([0, 100]);
  expect(subs[0].anchors.length).toBe(3);
});

test('deleting the last anchor of a subpath drops the subpath', () => {
  const subs: SubPath[] = [{ anchors: [corner(0, 0)], closed: false }];
  expect(deleteAnchor(subs, { sub: 0, anchor: 0 })).toEqual([]);
});

test('smooth and corner conversion sets and clears mirrored handles', () => {
  const subs: SubPath[] = [{ anchors: [corner(0, 0), corner(50, 0), corner(100, 0)], closed: false }];
  const smoothed = setAnchorSmooth(subs, { sub: 0, anchor: 1 }, 20, 10);
  expect(smoothed[0].anchors[1]).toEqual({ x: 50, y: 0, inDx: -20, inDy: -10, outDx: 20, outDy: 10 });
  const cornered = setAnchorCorner(smoothed, { sub: 0, anchor: 1 });
  expect(cornered[0].anchors[1]).toEqual({ x: 50, y: 0, inDx: 0, inDy: 0, outDx: 0, outDy: 0 });
});

test('moving an anchor keeps its handles relative', () => {
  const subs: SubPath[] = [{ anchors: [{ x: 10, y: 10, inDx: -5, inDy: 0, outDx: 5, outDy: 0 }], closed: false }];
  const after = moveAnchor(subs, { sub: 0, anchor: 0 }, 100, 200);
  expect(after[0].anchors[0]).toEqual({ x: 100, y: 200, inDx: -5, inDy: 0, outDx: 5, outDy: 0 });
});

test('moving a handle mirrors its partner when asked', () => {
  const subs: SubPath[] = [{ anchors: [{ x: 0, y: 0, inDx: -10, inDy: 0, outDx: 10, outDy: 0 }], closed: false }];
  const mirrored = moveHandle(subs, { sub: 0, anchor: 0, which: 'out' }, 0, 30, true);
  expect(mirrored[0].anchors[0].outDx).toBe(0);
  expect(mirrored[0].anchors[0].outDy).toBe(30);
  expect(mirrored[0].anchors[0].inDy).toBe(-30);
  const free = moveHandle(subs, { sub: 0, anchor: 0, which: 'out' }, 0, 30, false);
  expect(free[0].anchors[0].inDx).toBe(-10);
  expect(free[0].anchors[0].inDy).toBe(0);
});

test('translateSubPath shifts every anchor by the same delta', () => {
  const subs: SubPath[] = [{ anchors: [corner(0, 0), corner(10, 20)], closed: false }];
  const after = translateSubPath(subs, 0, 5, -5);
  expect(after[0].anchors.map((a) => [a.x, a.y])).toEqual([[5, -5], [15, 15]]);
});

test('pathBounds covers anchors and handles, and nulls when empty', () => {
  expect(pathBounds([])).toBeNull();
  const subs: SubPath[] = [{ anchors: [{ x: 0, y: 0, inDx: 0, inDy: 0, outDx: 0, outDy: 40 }, corner(100, 0)], closed: false }];
  expect(pathBounds(subs)).toEqual({ x: 0, y: 0, w: 100, h: 40 });
});
