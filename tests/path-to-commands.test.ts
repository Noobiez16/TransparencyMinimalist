import { expect, test } from 'vitest';
import { pathToCommands } from '../src/engine/path-geometry';
import type { Anchor, SubPath } from '../src/engine/path-model';

const corner = (x: number, y: number): Anchor => ({ x, y, inDx: 0, inDy: 0, outDx: 0, outDy: 0 });
const smooth = (x: number, y: number, dx: number, dy: number): Anchor =>
  ({ x, y, inDx: -dx, inDy: -dy, outDx: dx, outDy: dy });

test('a single anchor emits nothing', () => {
  const sp: SubPath = { anchors: [corner(10, 10)], closed: false };
  expect(pathToCommands([sp])).toEqual([]);
});

test('corner anchors emit straight lines', () => {
  const sp: SubPath = { anchors: [corner(0, 0), corner(100, 0), corner(100, 50)], closed: false };
  expect(pathToCommands([sp])).toEqual([
    { op: 'moveTo', x: 0, y: 0 },
    { op: 'lineTo', x: 100, y: 0 },
    { op: 'lineTo', x: 100, y: 50 }
  ]);
});

test('a smooth anchor emits a bezier with absolute control points', () => {
  const sp: SubPath = { anchors: [smooth(0, 0, 20, 0), smooth(100, 0, 20, 0)], closed: false };
  expect(pathToCommands([sp])).toEqual([
    { op: 'moveTo', x: 0, y: 0 },
    { op: 'bezierCurveTo', c1x: 20, c1y: 0, c2x: 80, c2y: 0, x: 100, y: 0 }
  ]);
});

test('a closed subpath returns to its first anchor and closes', () => {
  const sp: SubPath = { anchors: [corner(0, 0), corner(50, 0), corner(50, 50)], closed: true };
  expect(pathToCommands([sp])).toEqual([
    { op: 'moveTo', x: 0, y: 0 },
    { op: 'lineTo', x: 50, y: 0 },
    { op: 'lineTo', x: 50, y: 50 },
    { op: 'lineTo', x: 0, y: 0 },
    { op: 'close' }
  ]);
});

test('multiple subpaths each start with their own moveTo', () => {
  const a: SubPath = { anchors: [corner(0, 0), corner(10, 0)], closed: false };
  const b: SubPath = { anchors: [corner(50, 50), corner(60, 50)], closed: false };
  const cmds = pathToCommands([a, b]);
  expect(cmds.filter((c) => c.op === 'moveTo').length).toBe(2);
  expect(cmds[2]).toEqual({ op: 'moveTo', x: 50, y: 50 });
});

test('a mixed segment (one handle only) still emits a bezier', () => {
  const sp: SubPath = {
    anchors: [{ x: 0, y: 0, inDx: 0, inDy: 0, outDx: 30, outDy: 0 }, corner(100, 0)],
    closed: false
  };
  expect(pathToCommands([sp])[1]).toEqual({ op: 'bezierCurveTo', c1x: 30, c1y: 0, c2x: 100, c2y: 0, x: 100, y: 0 });
});
