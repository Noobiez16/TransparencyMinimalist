import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

function ctxStub() {
  return {
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, arcTo: () => {}, ellipse: () => {},
    closePath: () => {}, fill: () => {}, stroke: () => {}, drawImage: () => {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    measureText: (t: string) => ({ width: t.length * 10 })
  };
}

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let raster: typeof import('../src/engine/shape-raster');

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
  raster = await import('../src/engine/shape-raster');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

function addShape() {
  const layer = documentModel.createShapeLayer(
    stateModule.state.doc, { kind: 'rect', w: 100, h: 60, radius: 0 },
    { fill: '#ff0000', stroke: null, strokeWidth: 0 }
  );
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  return layer;
}

test('rasterizing swaps the layer to an image and is undoable in one step', () => {
  const layer = addShape();
  expect(raster.rasterizeShapeLayer(layer.id)).toBe(true);
  const after = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(after.kind).toBe('image');
  if (after.kind !== 'image') throw new Error('expected an image layer');
  expect(after.bitmap).not.toBeNull();
  expect(after.bitmap!.width).toBe(100);
  expect(after.bitmap!.height).toBe(60);
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Rasterize shape');

  history.undo();
  const reverted = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(reverted.kind).toBe('shape');
  if (reverted.kind !== 'shape') throw new Error('expected a shape layer');
  expect(reverted.shape).toEqual({ kind: 'rect', w: 100, h: 60, radius: 0 });
  expect(reverted.fill).toBe('#ff0000');
});

test('rasterizing preserves the layer transform and identity', () => {
  const layer = addShape();
  layer.rotation = 30;
  layer.scaleX = 150;
  layer.opacity = 60;
  raster.rasterizeShapeLayer(layer.id);
  const after = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(after.rotation).toBe(30);
  expect(after.scaleX).toBe(150);
  expect(after.opacity).toBe(60);
  expect(after.name).toBe(layer.name);
});

test('rasterizing a non-shape layer refuses without touching history', () => {
  const image = documentModel.createImageLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(image);
  expect(raster.rasterizeShapeLayer(image.id)).toBe(false);
  expect(raster.rasterizeShapeLayer('nope')).toBe(false);
  expect(history.entries().length).toBe(0);
});

test('a zero-area shape refuses to rasterize', () => {
  const layer = documentModel.createShapeLayer(
    stateModule.state.doc, { kind: 'rect', w: 0, h: 0, radius: 0 },
    { fill: '#ff0000', stroke: null, strokeWidth: 0 }
  );
  stateModule.state.doc.layers.push(layer);
  expect(raster.rasterizeShapeLayer(layer.id)).toBe(false);
  expect(history.entries().length).toBe(0);
});
