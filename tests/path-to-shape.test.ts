import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let store: typeof import('../src/engine/path-store');
let model: typeof import('../src/engine/path-model');
let ops: typeof import('../src/engine/path-ops');
let shapeGeometry: typeof import('../src/engine/shape-geometry');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        font: '', measureText: (t: string) => ({ width: t.length * 10 }),
        drawImage: () => {}, save: () => {}, restore: () => {}, translate: () => {},
        beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, bezierCurveTo: () => {},
        arcTo: () => {}, ellipse: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) =>
          ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData: () => {}
      })
    })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  store = await import('../src/engine/path-store');
  model = await import('../src/engine/path-model');
  ops = await import('../src/engine/path-ops');
  shapeGeometry = await import('../src/engine/shape-geometry');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

function squarePath() {
  const path = store.ensureActivePath();
  store.replaceSubPaths(path.id, [{
    anchors: [model.createAnchor(100, 100), model.createAnchor(200, 100), model.createAnchor(200, 200)],
    closed: true
  }], 'Draw');
  return path;
}

test('a path shape delegates to pathToCommands', () => {
  const subpaths = [{ anchors: [model.createAnchor(-10, -10), model.createAnchor(10, 10)], closed: false }];
  const cmds = shapeGeometry.shapeCommands({ kind: 'path', subpaths });
  expect(cmds).toEqual([
    { op: 'moveTo', x: -10, y: -10 },
    { op: 'lineTo', x: 10, y: 10 }
  ]);
  expect(shapeGeometry.shapeNaturalSize({ kind: 'path', subpaths })).toEqual({ w: 20, h: 20 });
});

test('convert recentres the path onto the new layer origin', () => {
  squarePath();
  expect(ops.convertPathToShape()).toBe(true);
  const layer = stateModule.state.doc.layers[0];
  expect(layer.kind).toBe('shape');
  if (layer.kind !== 'shape' || layer.shape.kind !== 'path') throw new Error('expected a path shape layer');
  // bounds are 100..200 in both axes, so the centre is (150,150)
  expect(layer.x).toBe(150);
  expect(layer.y).toBe(150);
  const xs = layer.shape.subpaths[0].anchors.map((a) => a.x);
  expect(Math.min(...xs)).toBe(-50);
  expect(Math.max(...xs)).toBe(50);
  expect(history.entries()[history.entries().length - 1].label).toBe('Convert path to shape');
});

test('convert refuses with no active path or an empty one', () => {
  expect(ops.convertPathToShape()).toBe(false);
  store.ensureActivePath();
  expect(ops.convertPathToShape()).toBe(false);
  expect(stateModule.state.doc.layers.length).toBe(0);
});
