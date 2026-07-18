import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        font: '',
        measureText: (text: string) => ({ width: text.length * 10 }),
        drawImage: () => {}
      })
    })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
});

let doc: import('../src/engine/document').Doc;

beforeEach(() => {
  doc = documentModel.createDoc(800, 600);
});

test('cloning a text layer copies fields with a fresh id and copy name', () => {
  const layer = documentModel.createTextLayer(doc);
  layer.text = 'Hello';
  layer.effects.blurOn = true;
  const clone = documentModel.cloneLayer(doc, layer);
  expect(clone.id).not.toBe(layer.id);
  expect(clone.name).toBe(`${layer.name} copy`);
  expect(clone.kind).toBe('text');
  expect((clone as import('../src/engine/document').TextLayer).text).toBe('Hello');
  expect(clone.effects).not.toBe(layer.effects);
  expect(clone.effects.blurOn).toBe(true);
  clone.effects.blurOn = false;
  expect(layer.effects.blurOn).toBe(true);
});

test('cloning an image layer clones the bitmap canvas', () => {
  const layer = documentModel.createImageLayer(doc);
  layer.bitmap = document.createElement('canvas') as unknown as HTMLCanvasElement;
  (layer.bitmap as { width: number }).width = 32;
  (layer.bitmap as { height: number }).height = 16;
  const clone = documentModel.cloneLayer(doc, layer) as import('../src/engine/document').ImageLayer;
  expect(clone.bitmap).not.toBe(layer.bitmap);
  expect(clone.bitmap?.width).toBe(32);
  expect(clone.bitmap?.height).toBe(16);
  expect(clone.bitmapRev).toBe(0);
});
