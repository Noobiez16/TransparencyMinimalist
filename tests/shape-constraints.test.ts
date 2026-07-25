import { expect, test } from 'vitest';
import { clampShape, clampStrokeWidth, constrainDragRect, constrainLine } from '../src/engine/shape-geometry';

const A = { x: 100, y: 100 };

test('a plain drag spans corner to corner', () => {
  const r = constrainDragRect(A, { x: 300, y: 200 }, { square: false, fromCenter: false });
  expect(r).toEqual({ cx: 200, cy: 150, w: 200, h: 100 });
});

test('a backwards drag still yields positive dimensions', () => {
  const r = constrainDragRect(A, { x: 40, y: 60 }, { square: false, fromCenter: false });
  expect(r).toEqual({ cx: 70, cy: 80, w: 60, h: 40 });
});

test('square constrains to the larger axis and keeps the drag direction', () => {
  const r = constrainDragRect(A, { x: 300, y: 150 }, { square: true, fromCenter: false });
  expect(r.w).toBe(200);
  expect(r.h).toBe(200);
  expect(r.cx).toBe(200);
  expect(r.cy).toBe(200);   // grew downward, matching the drag's sign
});

test('fromCenter treats the press point as the centre', () => {
  const r = constrainDragRect(A, { x: 200, y: 160 }, { square: false, fromCenter: true });
  expect(r).toEqual({ cx: 100, cy: 100, w: 200, h: 120 });
});

test('square plus fromCenter combine', () => {
  const r = constrainDragRect(A, { x: 200, y: 130 }, { square: true, fromCenter: true });
  expect(r.cx).toBe(100);
  expect(r.cy).toBe(100);
  expect(r.w).toBe(200);
  expect(r.h).toBe(200);
});

test('an unsnapped line keeps its exact delta and midpoint', () => {
  const line = constrainLine(A, { x: 220, y: 160 }, false);
  expect(line).toEqual({ cx: 160, cy: 130, dx: 120, dy: 60 });
});

test('a snapped line quantises to 15 degrees', () => {
  const flat = constrainLine(A, { x: 200, y: 108 }, true);   // ~4.6 degrees down
  expect(flat.dy).toBeCloseTo(0, 6);                          // snapped to horizontal
  expect(flat.dx).toBeCloseTo(Math.hypot(100, 8), 6);         // length is preserved
  const diagonal = constrainLine(A, { x: 200, y: 190 }, true);   // ~42 degrees
  expect(Math.abs(diagonal.dx)).toBeCloseTo(Math.abs(diagonal.dy), 6);   // snapped to 45
  const steep = constrainLine(A, { x: 143, y: 200 }, true);   // ~66.8 degrees
  expect(Math.atan2(steep.dy, steep.dx) * 180 / Math.PI).toBeCloseTo(60, 6);
});

test('clampShape bounds radius, sides, and negatives', () => {
  expect(clampShape({ kind: 'rect', w: 100, h: 40, radius: 90 }))
    .toEqual({ kind: 'rect', w: 100, h: 40, radius: 20 });
  expect(clampShape({ kind: 'rect', w: -10, h: 40, radius: -5 }))
    .toEqual({ kind: 'rect', w: 10, h: 40, radius: 0 });
  expect(clampShape({ kind: 'polygon', radius: 30, sides: 1 }))
    .toEqual({ kind: 'polygon', radius: 30, sides: 3 });
  expect(clampShape({ kind: 'polygon', radius: 30, sides: 99 }))
    .toEqual({ kind: 'polygon', radius: 30, sides: 24 });
  expect(clampShape({ kind: 'polygon', radius: 30, sides: 6.4 }))
    .toEqual({ kind: 'polygon', radius: 30, sides: 6 });
  expect(clampShape({ kind: 'ellipse', rx: -5, ry: 20 }))
    .toEqual({ kind: 'ellipse', rx: 5, ry: 20 });
});

test('clampStrokeWidth bounds to 0-100', () => {
  expect(clampStrokeWidth(-3)).toBe(0);
  expect(clampStrokeWidth(250)).toBe(100);
  expect(clampStrokeWidth(4.6)).toBe(5);
  expect(clampStrokeWidth(Number.NaN)).toBe(0);
});
