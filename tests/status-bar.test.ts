import { beforeAll, expect, test, vi } from 'vitest';

vi.mock('../src/canvas', () => ({ getZoomPercent: () => 100, setZoomPercent: () => {} }));

let statusBar: typeof import('../src/shell/status-bar');
let documentModel: typeof import('../src/engine/document');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} }) })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  statusBar = await import('../src/shell/status-bar');
  documentModel = await import('../src/engine/document');
});

test('zoom input parses and clamps like the engine', () => {
  expect(statusBar.parseZoomInput('250')).toBe(250);
  expect(statusBar.parseZoomInput(' 250% ')).toBe(250);
  expect(statusBar.parseZoomInput('7')).toBe(25);
  expect(statusBar.parseZoomInput('900')).toBe(400);
  expect(statusBar.parseZoomInput('abc')).toBeNull();
  expect(statusBar.parseZoomInput('')).toBeNull();
});

test('document sizes estimate flat and layered bytes', () => {
  const doc = documentModel.createDoc(1024, 1024);
  const layer = documentModel.createImageLayer(doc);
  layer.bitmap = { width: 512, height: 256 } as HTMLCanvasElement;
  doc.layers.push(layer);
  expect(statusBar.formatDocSizes(doc)).toBe('4.0M / 4.5M');
});
