import { describe, expect, test } from 'vitest';
import {
  documentToLocal,
  getHandlePoints,
  getLayerQuad,
  hitTestHandle,
  hitTestLayer,
  localToDocument,
  normalizeDegrees,
  resizeFromHandle,
  rotationFromPointer,
  type HandleId,
  type LayerTransform,
  type Point
} from '../src/engine/transform-geometry';

const natural = { w: 100, h: 50 };
const base: LayerTransform = { x: 100, y: 80, scaleX: 100, scaleY: 100, rotation: 0 };

function expectPoint(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
}

describe('pure affine transform geometry', () => {
  test('local and document coordinates round-trip through independent scale and rotation', () => {
    const transform = { x: 37, y: -12, scaleX: 150, scaleY: 40, rotation: 33 };
    const local = { x: 12, y: -4 };

    expectPoint(documentToLocal(transform, localToDocument(transform, local)), local);
  });

  test('returns finite coordinates for invalid transform and point values', () => {
    const invalid = { x: Number.NaN, y: Infinity, scaleX: Number.NaN, scaleY: Infinity, rotation: Infinity };

    expect(localToDocument(invalid, { x: Infinity, y: Number.NaN })).toEqual({ x: 0, y: 0 });
    expect(documentToLocal(invalid, { x: Infinity, y: Number.NaN })).toEqual({ x: 0, y: 0 });
  });

  test.each([
    [0, [{ x: 50, y: 55 }, { x: 150, y: 55 }, { x: 150, y: 105 }, { x: 50, y: 105 }]],
    [45, [
      { x: 100 - 25 / Math.SQRT2, y: 80 - 75 / Math.SQRT2 },
      { x: 100 + 75 / Math.SQRT2, y: 80 + 25 / Math.SQRT2 },
      { x: 100 + 25 / Math.SQRT2, y: 80 + 75 / Math.SQRT2 },
      { x: 100 - 75 / Math.SQRT2, y: 80 - 25 / Math.SQRT2 }
    ]],
    [90, [{ x: 125, y: 30 }, { x: 125, y: 130 }, { x: 75, y: 130 }, { x: 75, y: 30 }]]
  ])('computes clockwise corners at %i degrees', (rotation, expected) => {
    const quad = getLayerQuad({ ...base, rotation }, natural);

    expectPoint(quad.center, { x: 100, y: 80 });
    quad.corners.forEach((corner, index) => expectPoint(corner, expected[index]));
  });

  test('places all resize handles and the rotation handle around the layer', () => {
    const handles = getHandlePoints(base, natural, 20);
    const expected: Record<HandleId, Point> = {
      nw: { x: 50, y: 55 }, n: { x: 100, y: 55 }, ne: { x: 150, y: 55 },
      e: { x: 150, y: 80 }, se: { x: 150, y: 105 }, s: { x: 100, y: 105 },
      sw: { x: 50, y: 105 }, w: { x: 50, y: 80 }, rotate: { x: 100, y: 35 }
    };

    (Object.keys(expected) as HandleId[]).forEach((id) => expectPoint(handles[id], expected[id]));
  });

  test('rotates handle locations with the layer and detects handle hit targets', () => {
    const transform = { ...base, rotation: 90 };
    const handles = getHandlePoints(transform, natural, 20);

    expectPoint(handles.n, { x: 125, y: 80 });
    expectPoint(handles.rotate, { x: 145, y: 80 });
    expect(hitTestHandle(transform, natural, { x: handles.se.x + 3, y: handles.se.y + 4 }, 5)).toBe('se');
    expect(hitTestHandle(transform, natural, { x: 100, y: 80 }, 5)).toBeNull();
  });

  test('hit-tests the exact rotated layer interior instead of its axis-aligned bounds', () => {
    const transform = { ...base, rotation: 45 };

    expect(hitTestLayer(transform, natural, { x: 100, y: 80 })).toBe(true);
    expect(hitTestLayer(transform, natural, localToDocument(transform, { x: 49, y: 24 }))).toBe(true);
    expect(hitTestLayer(transform, natural, { x: 145, y: 80 })).toBe(false);
  });

  test('does not hit-test a layer with a non-invertible display axis', () => {
    const collapsed = { ...base, scaleX: 0 };
    const effectivelyCollapsed = { ...base, scaleX: 1e-11 };

    expect(hitTestLayer(collapsed, natural, { x: collapsed.x, y: collapsed.y })).toBe(false);
    expect(hitTestLayer(collapsed, natural, { x: 1_000_000, y: collapsed.y })).toBe(false);
    expect(hitTestLayer(effectivelyCollapsed, natural, { x: 1_000_000, y: effectivelyCollapsed.y })).toBe(false);
  });

  test('linked corner resizing preserves proportions and fixes the opposite corner', () => {
    const resized = resizeFromHandle({
      start: base, natural, handle: 'se', startPointer: { x: 150, y: 105 },
      pointer: { x: 250, y: 155 }, linked: true, minSize: 1
    });

    expect(resized).toEqual({ x: 150, y: 105, scaleX: 200, scaleY: 200, rotation: 0 });
    expectPoint(getHandlePoints(resized, natural).nw, getHandlePoints(base, natural).nw);
  });

  test('side resizing changes only its axis and fixes the opposite edge', () => {
    const resized = resizeFromHandle({
      start: { ...base, rotation: 90 }, natural, handle: 'e', startPointer: { x: 100, y: 130 },
      pointer: { x: 100, y: 180 }, linked: false, minSize: 1
    });

    expect(resized.scaleX).toBeCloseTo(150);
    expect(resized.scaleY).toBe(100);
    expectPoint(getHandlePoints(resized, natural).w, getHandlePoints({ ...base, rotation: 90 }, natural).w);
  });

  test('negative-direction drags clamp rather than accidentally invert the layer', () => {
    const resized = resizeFromHandle({
      start: base, natural, handle: 'e', startPointer: { x: 150, y: 80 },
      pointer: { x: 0, y: 80 }, linked: false, minSize: 1
    });

    expect(resized.scaleX).toBe(1);
    expect(resized.scaleY).toBe(100);
    expect(resized.x).toBeCloseTo(50.5);
  });

  test('enforces a one-pixel minimum display size for corner resizing', () => {
    const resized = resizeFromHandle({
      start: base, natural, handle: 'se', startPointer: { x: 150, y: 105 },
      pointer: { x: 49, y: 54 }, linked: false, minSize: 1
    });

    expect(resized.scaleX).toBe(1);
    expect(resized.scaleY).toBe(2);
    expectPoint(getHandlePoints(resized, natural).nw, { x: 50, y: 55 });
  });

  test.each([
    [370, 10], [-10, 350], [720, 0], [-360, 0], [Number.NaN, 0], [Infinity, 0]
  ])('normalizes %s degrees to %s', (value, expected) => {
    expect(normalizeDegrees(value)).toBe(expected);
  });

  test('computes free rotation and constrains it to 15-degree increments', () => {
    const center = { x: 10, y: 20 };
    const pointer = { x: 110, y: 40 };

    expect(rotationFromPointer(center, pointer, false)).toBeCloseTo(11.309932, 5);
    expect(rotationFromPointer(center, pointer, true)).toBe(15);
    expect(rotationFromPointer(center, center, true)).toBe(0);
  });
});
