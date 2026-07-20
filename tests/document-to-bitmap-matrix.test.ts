import { expect, test } from 'vitest';
import { documentToBitmap, documentToBitmapMatrix, type LayerTransform } from '../src/engine/transform-geometry';

const natural = { w: 100, h: 50 };

/** Apply a setTransform tuple to a point the way canvas would. */
function applyMatrix(m: number[], p: { x: number; y: number }) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

test('identity transform maps doc origin to the bitmap top-left', () => {
  const t: LayerTransform = { x: 50, y: 25, scaleX: 100, scaleY: 100, rotation: 0 };
  const m = documentToBitmapMatrix(t, natural);
  expect(applyMatrix(m, { x: 0, y: 0 }).x).toBeCloseTo(0, 6);
  expect(applyMatrix(m, { x: 0, y: 0 }).y).toBeCloseTo(0, 6);
});

test('the matrix agrees with documentToBitmap for translated and scaled layers', () => {
  const t: LayerTransform = { x: 512, y: 512, scaleX: 400, scaleY: 400, rotation: 0 };
  const m = documentToBitmapMatrix(t, { w: 320, h: 200 });
  for (const p of [{ x: 512, y: 512 }, { x: 552, y: 512 }, { x: 300, y: 700 }]) {
    const viaMatrix = applyMatrix(m, p);
    const viaPoint = documentToBitmap(t, { w: 320, h: 200 }, p);
    expect(viaMatrix.x).toBeCloseTo(viaPoint.x, 6);
    expect(viaMatrix.y).toBeCloseTo(viaPoint.y, 6);
  }
});

test('the matrix agrees with documentToBitmap under rotation', () => {
  const t: LayerTransform = { x: 200, y: 150, scaleX: 150, scaleY: 150, rotation: 37 };
  const m = documentToBitmapMatrix(t, natural);
  for (const p of [{ x: 200, y: 150 }, { x: 260, y: 120 }, { x: 90, y: 210 }]) {
    const viaMatrix = applyMatrix(m, p);
    const viaPoint = documentToBitmap(t, natural, p);
    expect(viaMatrix.x).toBeCloseTo(viaPoint.x, 6);
    expect(viaMatrix.y).toBeCloseTo(viaPoint.y, 6);
  }
});

test('degenerate scales fall back to identity', () => {
  const t: LayerTransform = { x: 10, y: 10, scaleX: 0, scaleY: 100, rotation: 0 };
  expect(documentToBitmapMatrix(t, natural)).toEqual([1, 0, 0, 1, 0, 0]);
});
