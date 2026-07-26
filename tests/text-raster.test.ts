import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

function ctxStub() {
  return {
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
    setTransform: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    bezierCurveTo: () => {}, arcTo: () => {}, ellipse: () => {}, closePath: () => {},
    fill: () => {}, stroke: () => {}, drawImage: () => {}, clearRect: () => {}, fillRect: () => {},
    fillText: () => {}, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
    textAlign: 'left', textBaseline: 'alphabetic',
    measureText: (t: string) => ({ width: t.length * 10 }),
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {}
  };
}

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let raster: typeof import('../src/engine/text-raster');

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
  raster = await import('../src/engine/text-raster');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

function addText() {
  const layer = documentModel.createTextLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  return layer;
}

test('rasterizing swaps the layer to an image and is undoable in one step', () => {
  const layer = addText();
  expect(raster.rasterizeTextLayer(layer.id)).toBe(true);
  const after = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(after.kind).toBe('image');
  if (after.kind !== 'image') throw new Error('expected an image layer');
  expect(after.bitmap).not.toBeNull();
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Rasterize type');

  history.undo();
  const reverted = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(reverted.kind).toBe('text');
  if (reverted.kind !== 'text') throw new Error('expected a text layer');
  expect(reverted.text).toBe(layer.text);
  expect(reverted.spans.length).toBe(1);
});

test('rasterizing preserves identity and transform', () => {
  const layer = addText();
  layer.rotation = 25;
  layer.opacity = 40;
  const name = layer.name;
  raster.rasterizeTextLayer(layer.id);
  const after = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(after.rotation).toBe(25);
  expect(after.opacity).toBe(40);
  expect(after.name).toBe(name);
});

test('rasterizing refuses on a non-text layer, a missing id, or empty text', () => {
  const image = documentModel.createImageLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(image);
  expect(raster.rasterizeTextLayer(image.id)).toBe(false);
  expect(raster.rasterizeTextLayer('nope')).toBe(false);

  const empty = addText();
  empty.text = '';
  empty.spans = [];
  expect(raster.rasterizeTextLayer(empty.id)).toBe(false);
  expect(history.entries().length).toBe(0);
});

test('convert refuses on empty text and on a non-text layer', () => {
  const image = documentModel.createImageLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(image);
  expect(raster.convertTextToShape(image.id)).toBe(false);
  const empty = addText();
  empty.text = '';
  empty.spans = [];
  expect(raster.convertTextToShape(empty.id)).toBe(false);
  expect(history.entries().length).toBe(0);
});
