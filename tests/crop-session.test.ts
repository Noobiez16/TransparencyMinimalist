import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../src/canvas', () => ({ getOverlayScale: () => 1 }));

let documentModel: typeof import('../src/engine/document');
let crop: typeof import('../src/engine/crop-session');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({
        font: '',
        measureText: (text: string) => ({ width: text.length * 10 })
      })
    })
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  documentModel = await import('../src/engine/document');
  crop = await import('../src/engine/crop-session');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
});

function addImage(id: string, x: number, y: number, w = 100, h = 100) {
  const layer = documentModel.createImageLayer(stateModule.state.doc, id);
  layer.id = id;
  layer.x = x;
  layer.y = y;
  layer.bitmap = { width: w, height: h } as HTMLCanvasElement;
  stateModule.state.doc.layers.push(layer);
  return layer;
}

beforeEach(() => {
  crop.cancelCrop();
  stateModule.state.doc = documentModel.createDoc(800, 600);
  history.clear();
});

describe('crop session lifecycle', () => {
  test('beginCrop initializes to the full document with a free ratio', () => {
    expect(crop.getCropSession()).toBeNull();
    expect(crop.beginCrop()).toBe(true);

    const session = crop.getCropSession();
    expect(session?.rect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(session?.ratio).toBe('free');
  });

  test('beginCrop refuses to stack sessions and cancelCrop tears down', () => {
    expect(crop.beginCrop()).toBe(true);
    expect(crop.beginCrop()).toBe(false);
    expect(crop.cancelCrop()).toBe(true);
    expect(crop.getCropSession()).toBeNull();
    expect(crop.cancelCrop()).toBe(false);
  });

  test('resetCrop restores the full-document rect and free ratio', () => {
    crop.beginCrop();
    crop.previewCrop({ x: 100, y: 50, width: 300, height: 200 });
    crop.setCropRatio('1:1');

    expect(crop.resetCrop()).toBe(true);
    const session = crop.getCropSession();
    expect(session?.rect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(session?.ratio).toBe('free');
  });
});

describe('explicit rect edits and validation', () => {
  test('previewCrop clamps to document bounds and a 1x1 minimum', () => {
    crop.beginCrop();

    expect(crop.previewCrop({ x: -50, y: -50 })).toBe(true);
    expect(crop.getCropSession()?.rect).toMatchObject({ x: 0, y: 0 });

    crop.previewCrop({ x: 100, y: 100, width: 10_000, height: 10_000 });
    expect(crop.getCropSession()?.rect).toEqual({ x: 100, y: 100, width: 700, height: 500 });

    crop.previewCrop({ width: 0.2, height: -5 });
    const rect = crop.getCropSession()?.rect;
    expect(rect?.width).toBe(1);
    expect(rect?.height).toBe(1);
  });

  test('previewCrop rejects non-finite values without changing the rect', () => {
    crop.beginCrop();
    const before = crop.getCropSession()!.rect;

    expect(crop.previewCrop({ x: Number.NaN })).toBe(false);
    expect(crop.previewCrop({ width: Number.POSITIVE_INFINITY })).toBe(false);
    expect(crop.getCropSession()?.rect).toEqual(before);
  });

  test('the crop rect supports 1x1 and full 4096x4096 documents', () => {
    stateModule.state.doc = documentModel.createDoc(4096, 4096);
    crop.beginCrop();
    expect(crop.getCropSession()?.rect).toEqual({ x: 0, y: 0, width: 4096, height: 4096 });
    crop.previewCrop({ x: 4095, y: 4095, width: 1, height: 1 });
    expect(crop.getCropSession()?.rect).toEqual({ x: 4095, y: 4095, width: 1, height: 1 });
    crop.cancelCrop();
  });
});

describe('aspect ratios', () => {
  test('presets constrain the rect immediately, centered on the previous rect', () => {
    crop.beginCrop();

    expect(crop.setCropRatio('1:1')).toBe(true);
    let rect = crop.getCropSession()!.rect;
    expect(rect.width).toBe(rect.height);
    expect(rect.width).toBe(600);
    expect(rect.x).toBe(100);
    expect(rect.y).toBe(0);

    expect(crop.setCropRatio('16:9')).toBe(true);
    rect = crop.getCropSession()!.rect;
    expect(rect.width / rect.height).toBeCloseTo(16 / 9, 5);

    expect(crop.setCropRatio('9:16')).toBe(true);
    rect = crop.getCropSession()!.rect;
    expect(rect.width / rect.height).toBeCloseTo(9 / 16, 5);

    expect(crop.setCropRatio('4:5')).toBe(true);
    rect = crop.getCropSession()!.rect;
    expect(rect.width / rect.height).toBeCloseTo(4 / 5, 5);
  });

  test('original matches the document aspect and free releases the lock', () => {
    crop.beginCrop();
    crop.previewCrop({ x: 200, y: 150, width: 100, height: 100 });

    expect(crop.setCropRatio('original')).toBe(true);
    const rect = crop.getCropSession()!.rect;
    expect(rect.width / rect.height).toBeCloseTo(800 / 600, 5);

    expect(crop.setCropRatio('free')).toBe(true);
    expect(crop.previewCrop({ width: 123, height: 77 })).toBe(true);
    expect(crop.getCropSession()?.rect).toMatchObject({ width: 123, height: 77 });
  });

  test('custom ratios validate numerator and denominator', () => {
    crop.beginCrop();

    expect(crop.setCropRatio({ numerator: 2, denominator: 3 })).toBe(true);
    const rect = crop.getCropSession()!.rect;
    expect(rect.width / rect.height).toBeCloseTo(2 / 3, 5);

    for (const invalid of [
      { numerator: 0, denominator: 3 },
      { numerator: 3, denominator: 0 },
      { numerator: -1, denominator: 2 },
      { numerator: Number.NaN, denominator: 2 },
      { numerator: 1.5, denominator: 2 },
      { numerator: 5000, denominator: 2 }
    ]) {
      expect(crop.setCropRatio(invalid)).toBe(false);
    }
    expect(crop.getCropSession()!.rect).toEqual(rect);
  });

  test('locked ratios keep explicit edits proportional', () => {
    crop.beginCrop();
    crop.setCropRatio('1:1');

    crop.previewCrop({ width: 200 });
    expect(crop.getCropSession()?.rect).toMatchObject({ width: 200, height: 200 });

    crop.previewCrop({ height: 150 });
    expect(crop.getCropSession()?.rect).toMatchObject({ width: 150, height: 150 });
  });
});

describe('handle gestures', () => {
  test('edge drags stay inside the document and respect the 1x1 minimum', () => {
    crop.beginCrop();
    crop.previewCrop({ x: 100, y: 100, width: 400, height: 300 });

    crop.beginCropGesture('e', { x: 500, y: 250 });
    crop.previewCropGesture({ x: 900, y: 250 });
    expect(crop.getCropSession()?.rect).toMatchObject({ x: 100, width: 700 });

    crop.previewCropGesture({ x: 0, y: 250 });
    expect(crop.getCropSession()?.rect).toMatchObject({ x: 100, width: 1 });
    crop.finishCropGesture();
  });

  test('corner drags anchor the opposite corner and honor a locked ratio', () => {
    crop.beginCrop();
    crop.previewCrop({ x: 100, y: 100, width: 400, height: 300 });
    crop.setCropRatio('1:1');
    const start = crop.getCropSession()!.rect;

    crop.beginCropGesture('se', { x: start.x + start.width, y: start.y + start.height });
    crop.previewCropGesture({ x: start.x + start.width + 100, y: start.y + start.height + 20 });
    const rect = crop.getCropSession()!.rect;
    expect(rect.x).toBe(start.x);
    expect(rect.y).toBe(start.y);
    expect(rect.width).toBe(rect.height);
    crop.finishCropGesture();
  });

  test('move drags translate the window without resizing and clamp to bounds', () => {
    crop.beginCrop();
    crop.previewCrop({ x: 100, y: 100, width: 400, height: 300 });

    crop.beginCropGesture('move', { x: 300, y: 250 });
    crop.previewCropGesture({ x: 340, y: 260 });
    expect(crop.getCropSession()?.rect).toEqual({ x: 140, y: 110, width: 400, height: 300 });

    crop.previewCropGesture({ x: 3000, y: 3000 });
    expect(crop.getCropSession()?.rect).toEqual({ x: 400, y: 300, width: 400, height: 300 });
    crop.finishCropGesture();
  });

  test('interrupting a gesture restores the pre-gesture rect', () => {
    crop.beginCrop();
    crop.previewCrop({ x: 100, y: 100, width: 400, height: 300 });
    const before = crop.getCropSession()!.rect;

    crop.beginCropGesture('se', { x: 500, y: 400 });
    crop.previewCropGesture({ x: 700, y: 500 });
    expect(crop.getCropSession()!.rect).not.toEqual(before);

    crop.interruptCropGesture();
    expect(crop.getCropSession()?.rect).toEqual(before);
  });
});

describe('apply, undo, and layer identity', () => {
  test('applyCrop resizes the document, translates layers, and undoes exactly', () => {
    const layer = addImage('subject', 400, 300);
    const bitmap = layer.bitmap;
    const untouched = addImage('other', 90, 80);

    crop.beginCrop();
    crop.previewCrop({ x: 150.4, y: 100.6, width: 500.2, height: 400.4 });
    expect(crop.applyCrop()).toBe(true);

    expect(crop.getCropSession()).toBeNull();
    expect(stateModule.state.doc.width).toBe(500);
    expect(stateModule.state.doc.height).toBe(400);
    expect(layer.x).toBe(400 - 150);
    expect(layer.y).toBe(300 - 101);
    expect(untouched.x).toBe(90 - 150);
    expect(untouched.y).toBe(80 - 101);
    expect(layer.bitmap).toBe(bitmap);
    expect(layer.scaleX).toBe(100);
    expect(layer.scaleY).toBe(100);
    expect(layer.rotation).toBe(0);

    expect(history.canUndo()).toBe(true);
    history.undo();
    expect(stateModule.state.doc.width).toBe(800);
    expect(stateModule.state.doc.height).toBe(600);
    expect(layer.x).toBe(400);
    expect(layer.y).toBe(300);
    expect(untouched.x).toBe(90);
    expect(untouched.y).toBe(80);
    expect(layer.bitmap).toBe(bitmap);

    history.redo();
    expect(stateModule.state.doc.width).toBe(500);
    expect(layer.x).toBe(250);
  });

  test('applying a full-document rect ends the session without a history entry', () => {
    crop.beginCrop();
    expect(crop.applyCrop()).toBe(true);
    expect(crop.getCropSession()).toBeNull();
    expect(history.canUndo()).toBe(false);
  });

  test('cancelCrop leaves the document and history untouched', () => {
    const layer = addImage('subject', 400, 300);
    crop.beginCrop();
    crop.previewCrop({ x: 100, y: 100, width: 200, height: 200 });

    expect(crop.cancelCrop()).toBe(true);
    expect(stateModule.state.doc.width).toBe(800);
    expect(layer.x).toBe(400);
    expect(history.canUndo()).toBe(false);
  });
});
