import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('../src/canvas', () => ({ getOverlayScale: () => 1 }));

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let overlay: typeof import('../src/canvas-overlay');
let sessions: typeof import('../src/engine/transform-session');

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
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  overlay = await import('../src/canvas-overlay');
  sessions = await import('../src/engine/transform-session');
});

beforeEach(() => {
  sessions.cancelTransform();
  stateModule.state.doc = documentModel.createDoc(800, 600);
  history.clear();
  overlay.setShowTransformControls(true);
});

test('toggling show-controls publishes a composite so the overlay repaints immediately', () => {
  const seen: Array<Set<string>> = [];
  stateModule.subscribe((dirty) => seen.push(new Set(dirty)));
  overlay.setShowTransformControls(false);
  expect(seen.some((dirty) => dirty.has('composite'))).toBe(true);
});
