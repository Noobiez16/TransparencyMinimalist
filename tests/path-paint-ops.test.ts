import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

function ctxStub() {
  return {
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
    setTransform: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    bezierCurveTo: () => {}, arcTo: () => {}, ellipse: () => {}, closePath: () => {},
    fill: () => {}, stroke: () => {}, drawImage: () => {}, clearRect: () => {}, fillRect: () => {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', globalCompositeOperation: 'source-over',
    measureText: (t: string) => ({ width: t.length * 10 }),
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {}
  };
}

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let store: typeof import('../src/engine/path-store');
let model: typeof import('../src/engine/path-model');
let ops: typeof import('../src/engine/path-ops');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ctxStub() };
      return canvas;
    }
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  store = await import('../src/engine/path-store');
  model = await import('../src/engine/path-model');
  ops = await import('../src/engine/path-ops');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

function imageLayer() {
  const layer = documentModel.createImageLayer(stateModule.state.doc);
  const bitmap = document.createElement('canvas') as unknown as HTMLCanvasElement;
  (bitmap as { width: number }).width = 200;
  (bitmap as { height: number }).height = 100;
  layer.bitmap = bitmap;
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  return layer;
}

function trianglePath() {
  const path = store.ensureActivePath();
  store.replaceSubPaths(path.id, [{
    anchors: [model.createAnchor(50, 50), model.createAnchor(150, 50), model.createAnchor(100, 120)],
    closed: true
  }], 'Draw');
  history.clear();
  return path;
}

test('fill and stroke each push one command', () => {
  imageLayer();
  trianglePath();
  expect(ops.fillPath()).toBe(true);
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Fill path');
  expect(ops.strokePath()).toBe(true);
  expect(history.entries()[history.entries().length - 1].label).toBe('Stroke path');
});

test('fill and stroke refuse without an image layer or a path', () => {
  trianglePath();
  expect(ops.fillPath()).toBe(false);        // no image layer
  stateModule.state.doc.layers = [];
  stateModule.state.doc.paths = [];
  stateModule.state.doc.activePathId = null;
  imageLayer();
  expect(ops.fillPath()).toBe(false);        // no path
  expect(ops.strokePath()).toBe(false);
  expect(history.entries().length).toBe(0);
});

test('makeWorkPathFromSelection refuses with no selection', () => {
  expect(ops.makeWorkPathFromSelection()).toBe(false);
  expect(stateModule.state.doc.paths.length).toBe(0);
});
