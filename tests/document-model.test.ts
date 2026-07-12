import { beforeAll, describe, expect, test, vi } from 'vitest';
import type { Doc, ImageLayer } from '../src/engine/document';

let documentModel: typeof import('../src/engine/document');
let compositor: typeof import('../src/engine/compositor');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({
        font: '',
        measureText: (text: string) => ({ width: text.length * 10 })
      })
    })
  });
  documentModel = await import('../src/engine/document');
  compositor = await import('../src/engine/compositor');
});

describe('version 2 affine document model', () => {
  test('new documents and layers use version 2 affine defaults', () => {
    const doc = documentModel.createDoc(640, 480);
    const layer = documentModel.createImageLayer(doc);

    expect(doc.version).toBe(2);
    expect(layer).toMatchObject({ scaleX: 100, scaleY: 100, rotation: 0 });
    expect(layer).not.toHaveProperty('scale');
  });

  test('display size applies independent axis percentages', () => {
    const doc = documentModel.createDoc();
    const layer = documentModel.createImageLayer(doc);
    layer.bitmap = { width: 200, height: 80 } as HTMLCanvasElement;
    layer.scaleX = 125;
    layer.scaleY = 50;

    expect(documentModel.layerNaturalSize(layer)).toEqual({ w: 200, h: 80 });
    expect(documentModel.layerDisplaySize(layer)).toEqual({ w: 250, h: 40 });
  });

  test('compositor rotates before applying independent scale', () => {
    const doc = documentModel.createDoc(200, 100);
    const layer = documentModel.createImageLayer(doc);
    layer.bitmap = { width: 20, height: 10 } as HTMLCanvasElement;
    layer.scaleX = 150;
    layer.scaleY = 75;
    layer.rotation = 30;
    doc.layers = [layer];

    const calls: string[] = [];
    const ctx = {
      clearRect: () => undefined,
      save: () => calls.push('save'),
      translate: (x: number, y: number) => calls.push(`translate:${x},${y}`),
      rotate: (radians: number) => calls.push(`rotate:${radians}`),
      scale: (x: number, y: number) => calls.push(`scale:${x},${y}`),
      drawImage: () => calls.push('drawImage'),
      restore: () => calls.push('restore'),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      filter: 'none'
    } as unknown as CanvasRenderingContext2D;

    compositor.composite(doc, ctx);

    const rotateIndex = calls.findIndex((call) => call.startsWith('rotate:'));
    const scaleIndex = calls.indexOf('scale:1.5,0.75');
    expect(rotateIndex).toBeGreaterThan(calls.findIndex((call) => call.startsWith('translate:')));
    expect(scaleIndex).toBeGreaterThan(rotateIndex);
    expect(calls[rotateIndex]).toBe(`rotate:${Math.PI / 6}`);
  });

  test('rotated layers use their rendered shape for bounds and hit-testing', () => {
    const doc = documentModel.createDoc();
    const layer = documentModel.createImageLayer(doc);
    layer.bitmap = { width: 100, height: 20 } as HTMLCanvasElement;
    layer.rotation = 90;

    expect(documentModel.layerBounds(layer)).toEqual({
      x: layer.x - 10,
      y: layer.y - 50,
      w: 20,
      h: 100
    });
    expect(documentModel.layerContainsPoint(layer, { x: layer.x, y: layer.y + 49 })).toBe(true);
    expect(documentModel.layerContainsPoint(layer, { x: layer.x + 49, y: layer.y })).toBe(false);
  });
});

// Compile-time fixture: the public model accepts affine image layers without a legacy scale.
const affineLayerFixture: ImageLayer = {} as ImageLayer;
const versionTwoFixture: Doc['version'] = 2;
void affineLayerFixture;
void versionTwoFixture;
