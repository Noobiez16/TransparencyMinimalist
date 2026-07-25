import { beforeAll, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} })
    })
  });
  documentModel = await import('../src/engine/document');
});

test('shape layers report their geometric size', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createShapeLayer(
    doc, { kind: 'rect', w: 120, h: 80, radius: 0 },
    { fill: '#ff0000', stroke: null, strokeWidth: 0 }
  );
  expect(documentModel.layerNaturalSize(layer)).toEqual({ w: 120, h: 80 });
});

test('a flat line is floored to its stroke width so it stays selectable', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createShapeLayer(
    doc, { kind: 'line', dx: 200, dy: 0 },
    { fill: null, stroke: '#000000', strokeWidth: 6 }
  );
  expect(documentModel.layerNaturalSize(layer)).toEqual({ w: 200, h: 6 });
});
