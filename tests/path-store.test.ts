import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let store: typeof import('../src/engine/path-store');
let model: typeof import('../src/engine/path-model');

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
  store = await import('../src/engine/path-store');
  model = await import('../src/engine/path-model');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

test('ensureActivePath creates a Work Path once', () => {
  const first = store.ensureActivePath();
  expect(first.name).toBe('Work Path');
  expect(stateModule.state.doc.paths.length).toBe(1);
  const second = store.ensureActivePath();
  expect(second.id).toBe(first.id);
  expect(stateModule.state.doc.paths.length).toBe(1);
});

test('replaceSubPaths pushes one undoable command', () => {
  const path = store.ensureActivePath();
  const subs = [{ anchors: [model.createAnchor(0, 0), model.createAnchor(10, 10)], closed: false }];
  store.replaceSubPaths(path.id, subs, 'Add anchor');
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Add anchor');
  expect(store.getActivePath()?.subpaths[0].anchors.length).toBe(2);
  history.undo();
  expect(store.getActivePath()?.subpaths.length).toBe(0);
});

test('add, duplicate, rename, and delete manage the list and the active id', () => {
  store.addPath('Path 1');
  expect(stateModule.state.doc.paths.length).toBe(1);
  const first = store.getActivePath()!;
  store.replaceSubPaths(first.id, [{ anchors: [model.createAnchor(1, 1), model.createAnchor(2, 2)], closed: true }], 'Edit');

  store.duplicateActivePath();
  expect(stateModule.state.doc.paths.length).toBe(2);
  const copy = store.getActivePath()!;
  expect(copy.id).not.toBe(first.id);
  expect(copy.subpaths[0].anchors.length).toBe(2);

  store.renamePath(copy.id, 'Renamed');
  expect(store.getActivePath()?.name).toBe('Renamed');

  store.deletePath(copy.id);
  expect(stateModule.state.doc.paths.length).toBe(1);
  expect(stateModule.state.doc.activePathId).toBe(first.id);
});

test('deleting the last path clears the active id', () => {
  store.addPath('Only');
  const id = store.getActivePath()!.id;
  store.deletePath(id);
  expect(stateModule.state.doc.paths).toEqual([]);
  expect(stateModule.state.doc.activePathId).toBeNull();
  expect(store.getActivePath()).toBeNull();
});

test('deleting a path is undoable', () => {
  store.addPath('Path 1');
  const id = store.getActivePath()!.id;
  history.clear();
  store.deletePath(id);
  expect(stateModule.state.doc.paths.length).toBe(0);
  history.undo();
  expect(stateModule.state.doc.paths.length).toBe(1);
  expect(stateModule.state.doc.activePathId).toBe(id);
});
