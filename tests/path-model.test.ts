import { beforeAll, expect, test, vi } from 'vitest';

let pathModel: typeof import('../src/engine/path-model');
let documentModel: typeof import('../src/engine/document');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} })
    })
  });
  pathModel = await import('../src/engine/path-model');
  documentModel = await import('../src/engine/document');
});

test('a fresh anchor is a corner with zero handles', () => {
  const a = pathModel.createAnchor(10, 20);
  expect(a).toEqual({ x: 10, y: 20, inDx: 0, inDy: 0, outDx: 0, outDy: 0 });
  expect(pathModel.isCornerAnchor(a)).toBe(true);
  expect(pathModel.isCornerAnchor({ ...a, outDx: 5 })).toBe(false);
});

test('createPathItem starts empty with a unique id', () => {
  const a = pathModel.createPathItem('Work Path');
  const b = pathModel.createPathItem('Work Path');
  expect(a.name).toBe('Work Path');
  expect(a.subpaths).toEqual([]);
  expect(a.id).not.toBe(b.id);
});

test('clonePathItem deep-copies anchors and takes a fresh id', () => {
  const original = pathModel.createPathItem('Path 1');
  original.subpaths.push({ anchors: [pathModel.createAnchor(1, 2), pathModel.createAnchor(3, 4)], closed: true });
  const copy = pathModel.clonePathItem(original, 'Path 1 copy');
  expect(copy.id).not.toBe(original.id);
  expect(copy.name).toBe('Path 1 copy');
  expect(copy.subpaths).toEqual(original.subpaths);
  expect(copy.subpaths).not.toBe(original.subpaths);
  expect(copy.subpaths[0].anchors[0]).not.toBe(original.subpaths[0].anchors[0]);
  copy.subpaths[0].anchors[0].x = 99;
  expect(original.subpaths[0].anchors[0].x).toBe(1);
});

test('a new document starts with no paths', () => {
  const doc = documentModel.createDoc(400, 300);
  expect(doc.paths).toEqual([]);
  expect(doc.activePathId).toBeNull();
});
