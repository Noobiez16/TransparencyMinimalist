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

test('createShapeLayer builds a centred vector layer', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createShapeLayer(
    doc, { kind: 'rect', w: 100, h: 50, radius: 8 },
    { fill: '#ff0000', stroke: '#000000', strokeWidth: 4 }
  );
  expect(layer.kind).toBe('shape');
  expect(layer.shape).toEqual({ kind: 'rect', w: 100, h: 50, radius: 8 });
  expect(layer.fill).toBe('#ff0000');
  expect(layer.stroke).toBe('#000000');
  expect(layer.strokeWidth).toBe(4);
  expect(layer.x).toBe(200);
  expect(layer.y).toBe(150);
  expect(layer.scaleX).toBe(100);
  expect(layer.rotation).toBe(0);
});

test('cloneLayer deep-copies a shape layer with a fresh id', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createShapeLayer(
    doc, { kind: 'polygon', radius: 40, sides: 6 },
    { fill: null, stroke: '#123456', strokeWidth: 2 }
  );
  const copy = documentModel.cloneLayer(doc, layer);
  expect(copy.kind).toBe('shape');
  expect(copy.id).not.toBe(layer.id);
  expect(copy.name).toBe(`${layer.name} copy`);
  if (copy.kind !== 'shape') throw new Error('expected a shape layer');
  expect(copy.shape).toEqual(layer.shape);
  expect(copy.shape).not.toBe(layer.shape);   // deep copy, not a shared reference
  expect(copy.stroke).toBe('#123456');
  expect(copy.fill).toBeNull();
});

test('getFilterString accepts the shape kind and skips image-only filters', () => {
  const effects = documentModel.defaultEffects();
  effects.blurOn = true;
  effects.blur = 3;
  effects.invert = true;
  const filter = documentModel.getFilterString(effects, 'shape');
  expect(filter).toContain('blur(3px)');
  expect(filter).toContain('invert(1)');
  expect(filter).not.toContain('saturate');
});
