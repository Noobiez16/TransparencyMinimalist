import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('../src/canvas', () => ({ getOverlayScale: () => 1 }));

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let colorState: typeof import('../src/engine/color-state');
let chips: typeof import('../src/shell/color-chips');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} })
    })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  colorState = await import('../src/engine/color-state');
  chips = await import('../src/shell/color-chips');
  chips.wireColorApplication();
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(800, 600);
  history.clear();
  colorState.resetColors();
});

test('foreground edits recolor the active text layer as one coalesced command', () => {
  const layer = documentModel.createTextLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  colorState.setForeground('#ff0000');
  colorState.setForeground('#00ff00');
  expect(layer.color).toBe('#00ff00');
  expect(history.entries().length).toBe(1);
});

test('foreground edits ignore image layers and empty selections', () => {
  const layer = documentModel.createImageLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  colorState.setForeground('#123456');
  expect(history.entries().length).toBe(0);
});

test('background edits patch the doc only in custom background mode', () => {
  colorState.setBackground('#222222');
  expect(stateModule.state.doc.bgColor).toBe('#ffffff');
  stateModule.state.doc.bgType = 'custom';
  colorState.setBackground('#333333');
  expect(stateModule.state.doc.bgColor).toBe('#333333');
});
