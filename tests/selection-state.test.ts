import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

function ctxStub() {
  return {
    fillStyle: '', globalCompositeOperation: 'source-over',
    fillRect: () => {}, clearRect: () => {}, beginPath: () => {}, closePath: () => {},
    moveTo: () => {}, lineTo: () => {}, ellipse: () => {}, fill: () => {},
    save: () => {}, restore: () => {}, drawImage: () => {}, setTransform: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
  };
}

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let selection: typeof import('../src/engine/selection');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub() })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  selection = await import('../src/engine/selection');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
  selection.__setSelectionOpsForTest([]);
});

const rectOp = (x: number, y: number, w: number, h: number, mode: 'new' | 'add' | 'subtract' = 'new') =>
  ({ kind: 'shape', shape: { kind: 'rect', x, y, w, h }, mode }) as const;

test('committing a selection pushes exactly one command and sets state', () => {
  expect(selection.hasSelection()).toBe(false);
  selection.commitSelection(rectOp(10, 10, 50, 50), 'Rectangular selection');
  expect(selection.hasSelection()).toBe(true);
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Rectangular selection');
  expect(selection.getSelectionOps().length).toBe(1);
});

test('undo and redo move between selection states', () => {
  selection.commitSelection(rectOp(0, 0, 20, 20), 'Rectangular selection');
  selection.commitSelection(rectOp(30, 30, 20, 20, 'add'), 'Add to selection');
  expect(selection.getSelectionOps().length).toBe(2);
  history.undo();
  expect(selection.getSelectionOps().length).toBe(1);
  history.undo();
  expect(selection.hasSelection()).toBe(false);
  history.redo();
  expect(selection.getSelectionOps().length).toBe(1);
});

test('select all, deselect, and reselect round-trip', () => {
  selection.selectAll();
  expect(selection.hasSelection()).toBe(true);
  selection.deselect();
  expect(selection.hasSelection()).toBe(false);
  selection.reselect();
  expect(selection.hasSelection()).toBe(true);
  expect(selection.getSelectionOps()).toEqual([{ kind: 'all' }]);
});

test('deselect on an empty selection pushes no command', () => {
  const before = history.entries().length;
  selection.deselect();
  expect(history.entries().length).toBe(before);
});

test('invert appends an invert op', () => {
  selection.commitSelection(rectOp(0, 0, 10, 10), 'Rectangular selection');
  selection.invertSelection();
  const ops = selection.getSelectionOps();
  expect(ops[ops.length - 1]).toEqual({ kind: 'invert' });
});

test('subscribers fire on every selection change', () => {
  let calls = 0;
  selection.subscribeSelection(() => { calls++; });
  selection.selectAll();
  selection.deselect();
  expect(calls).toBeGreaterThanOrEqual(2);
});
