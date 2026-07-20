import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('../src/canvas', () => ({ getOverlayScale: () => 1 }));

function ctxStub(canvas: { width: number; height: number }) {
  return {
    font: '',
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    measureText: (t: string) => ({ width: t.length * 10 }),
    drawImage: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {}
  };
}

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let sessions: typeof import('../src/engine/transform-session');
let strokes: typeof import('../src/engine/stroke-session');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ctxStub(canvas) };
      return canvas;
    }
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });

  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  sessions = await import('../src/engine/transform-session');
  strokes = await import('../src/engine/stroke-session');
});

const config = { tool: 'brush' as const, size: 20, hardness: 50, opacity: 100, color: '#ff0000' };

beforeEach(() => {
  strokes.cancelStroke();
  sessions.cancelTransform();
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

function addImageLayer(withBitmap = true) {
  const layer = documentModel.createImageLayer(stateModule.state.doc);
  if (withBitmap) {
    const bitmap = document.createElement('canvas') as unknown as HTMLCanvasElement;
    (bitmap as { width: number }).width = 200;
    (bitmap as { height: number }).height = 100;
    layer.bitmap = bitmap;
  }
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  return layer;
}

test('refusals: missing, text layer, hidden, busy', () => {
  expect(strokes.beginStroke('nope', config)).toEqual({ ok: false, reason: 'missing' });
  const text = documentModel.createTextLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(text);
  expect(strokes.beginStroke(text.id, config)).toEqual({ ok: false, reason: 'text-layer' });
  const img = addImageLayer();
  img.visible = false;
  expect(strokes.beginStroke(img.id, config)).toEqual({ ok: false, reason: 'hidden' });
  img.visible = true;
  sessions.beginTransform(img.id, 'explicit');
  expect(strokes.beginStroke(img.id, config)).toEqual({ ok: false, reason: 'busy' });
  sessions.cancelTransform();
  expect(strokes.beginStroke(img.id, config)).toEqual({ ok: true });
});

test('a stroke commits exactly one command with region byte accounting', () => {
  // history.entries() projects to { label } only, so capture the command itself to
  // assert the byte budget the history eviction logic depends on.
  const pushed: Array<{ label: string; bytes?: number }> = [];
  const spy = vi.spyOn(history, 'push').mockImplementation((cmd) => {
    pushed.push(cmd);
    cmd.do();
  });

  const img = addImageLayer();
  expect(strokes.beginStroke(img.id, config)).toEqual({ ok: true });
  strokes.addStrokePoint({ x: img.x, y: img.y });
  strokes.addStrokePoint({ x: img.x + 20, y: img.y });
  strokes.endStroke();

  expect(strokes.getStrokeSession()).toBeNull();
  expect(pushed.length).toBe(1);
  expect(pushed[0].label).toBe('Brush stroke');
  // 20px brush over a 20px run: dirty rect is bounded and its bytes are 8 per pixel.
  expect(pushed[0].bytes).toBeGreaterThan(0);
  expect(pushed[0].bytes! % 8).toBe(0);
  expect(img.bitmapRev).toBeGreaterThan(0);
  spy.mockRestore();
});

test('a real stroke lands exactly one entry in the history stack', () => {
  const img = addImageLayer();
  strokes.beginStroke(img.id, config);
  strokes.addStrokePoint({ x: img.x, y: img.y });
  strokes.addStrokePoint({ x: img.x + 20, y: img.y });
  strokes.endStroke();
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Brush stroke');
});

test('empty image layers allocate a doc-sized bitmap bundled into one undo', () => {
  const img = addImageLayer(false);
  expect(img.bitmap).toBeNull();
  expect(strokes.beginStroke(img.id, config)).toEqual({ ok: true });
  expect(img.bitmap).not.toBeNull();
  expect((img.bitmap as unknown as { width: number }).width).toBe(400);
  expect((img.bitmap as unknown as { height: number }).height).toBe(300);
  expect(img.scaleX).toBe(100);
  strokes.addStrokePoint({ x: 200, y: 150 });
  strokes.endStroke();
  expect(history.entries().length).toBe(1);
  history.undo();
  expect(img.bitmap).toBeNull();
  history.redo();
  expect(img.bitmap).not.toBeNull();
});

test('cancel discards everything including a fresh allocation', () => {
  const img = addImageLayer(false);
  strokes.beginStroke(img.id, config);
  strokes.addStrokePoint({ x: 200, y: 150 });
  strokes.cancelStroke();
  expect(img.bitmap).toBeNull();
  expect(history.entries().length).toBe(0);
  expect(strokes.getStrokeSession()).toBeNull();
});

test('strokes entirely outside the bitmap produce no command', () => {
  const img = addImageLayer();
  strokes.beginStroke(img.id, config);
  strokes.addStrokePoint({ x: img.x + 5000, y: img.y + 5000 });
  strokes.endStroke();
  expect(history.entries().length).toBe(0);
});
