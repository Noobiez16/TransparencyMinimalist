import { expect, test } from 'vitest';
import { documentToBitmap, type LayerTransform } from '../src/engine/transform-geometry';

const base: LayerTransform = { x: 0, y: 0, scaleX: 100, scaleY: 100, rotation: 0 };
const natural = { w: 100, h: 50 };

test('identity: the layer center maps to the bitmap center', () => {
  expect(documentToBitmap(base, natural, { x: 0, y: 0 })).toEqual({ x: 50, y: 25 });
});

test('translation: doc offsets shift relative to the layer position', () => {
  const t = { ...base, x: 200, y: 300 };
  expect(documentToBitmap(t, natural, { x: 210, y: 295 })).toEqual({ x: 60, y: 20 });
});

test('scale: 200% halves the doc offset in bitmap space', () => {
  const t = { ...base, scaleX: 200, scaleY: 200 };
  expect(documentToBitmap(t, natural, { x: 20, y: -10 })).toEqual({ x: 60, y: 20 });
});

test('rotation: 90 degrees unrotates before offsetting', () => {
  const t = { ...base, rotation: 90 };
  const p = documentToBitmap(t, natural, { x: 0, y: -10 });
  expect(p.x).toBeCloseTo(40, 6);
  expect(p.y).toBeCloseTo(25, 6);
});

test('combined: translate + scale + rotation round-trips a known point', () => {
  const t: LayerTransform = { x: 512, y: 512, scaleX: 400, scaleY: 400, rotation: 0 };
  // fixture: 320x200 natural at 400% centered at 512 -> doc (512,512) = bitmap (160,100)
  expect(documentToBitmap(t, { w: 320, h: 200 }, { x: 512, y: 512 })).toEqual({ x: 160, y: 100 });
  // doc x=512+40 (=10 bitmap px right at 400%)
  expect(documentToBitmap(t, { w: 320, h: 200 }, { x: 552, y: 512 })).toEqual({ x: 170, y: 100 });
});
