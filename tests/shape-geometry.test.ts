import { expect, test } from 'vitest';
import { polygonPoints, shapeCommands, shapeNaturalSize } from '../src/engine/shape-geometry';

test('a square-cornered rectangle is four lines around the origin', () => {
  const cmds = shapeCommands({ kind: 'rect', w: 100, h: 60, radius: 0 });
  expect(cmds).toEqual([
    { op: 'moveTo', x: -50, y: -30 },
    { op: 'lineTo', x: 50, y: -30 },
    { op: 'lineTo', x: 50, y: 30 },
    { op: 'lineTo', x: -50, y: 30 },
    { op: 'close' }
  ]);
});

test('a rounded rectangle uses arcTo corners and still closes', () => {
  const cmds = shapeCommands({ kind: 'rect', w: 100, h: 60, radius: 10 });
  expect(cmds[0]).toEqual({ op: 'moveTo', x: -40, y: -30 });
  expect(cmds.filter((c) => c.op === 'arcTo').length).toBe(4);
  expect(cmds[cmds.length - 1]).toEqual({ op: 'close' });
});

test('an ellipse is a single centred ellipse command', () => {
  expect(shapeCommands({ kind: 'ellipse', rx: 30, ry: 20 })).toEqual([
    { op: 'ellipse', cx: 0, cy: 0, rx: 30, ry: 20 },
    { op: 'close' }
  ]);
});

test('a line runs corner to corner through the origin', () => {
  expect(shapeCommands({ kind: 'line', dx: 80, dy: -40 })).toEqual([
    { op: 'moveTo', x: -40, y: 20 },
    { op: 'lineTo', x: 40, y: -20 }
  ]);
});

test('polygon vertices start at the top and wind evenly', () => {
  const pts = polygonPoints(50, 4);
  expect(pts.length).toBe(4);
  expect(pts[0].x).toBeCloseTo(0, 6);
  expect(pts[0].y).toBeCloseTo(-50, 6);   // first vertex points up
  expect(pts[1].x).toBeCloseTo(50, 6);
  expect(pts[1].y).toBeCloseTo(0, 6);
  const cmds = shapeCommands({ kind: 'polygon', radius: 50, sides: 6 });
  expect(cmds.filter((c) => c.op === 'lineTo').length).toBe(5);
  expect(cmds[0].op).toBe('moveTo');
  expect(cmds[cmds.length - 1]).toEqual({ op: 'close' });
});

test('natural size is the geometric bounding box', () => {
  expect(shapeNaturalSize({ kind: 'rect', w: 100, h: 60, radius: 10 })).toEqual({ w: 100, h: 60 });
  expect(shapeNaturalSize({ kind: 'ellipse', rx: 30, ry: 20 })).toEqual({ w: 60, h: 40 });
  expect(shapeNaturalSize({ kind: 'line', dx: -80, dy: 40 })).toEqual({ w: 80, h: 40 });
  const tri = shapeNaturalSize({ kind: 'polygon', radius: 50, sides: 3 });
  expect(tri.w).toBeCloseTo(Math.sqrt(3) * 50, 4);   // exact triangle bbox, not the circumcircle
  expect(tri.h).toBeCloseTo(75, 4);
});
