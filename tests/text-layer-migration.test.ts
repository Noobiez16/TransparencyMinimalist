import { beforeAll, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');
let textModel: typeof import('../src/engine/text-model');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} })
    })
  });
  documentModel = await import('../src/engine/document');
  textModel = await import('../src/engine/text-model');
});

test('a new text layer carries one span covering its text', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createTextLayer(doc);
  expect(layer.kind).toBe('text');
  expect(layer.align).toBe('center');
  expect(layer.spans.length).toBe(1);
  expect(layer.spans[0].start).toBe(0);
  expect(layer.spans[0].end).toBe(layer.text.length);
  expect(layer.spans[0].style.fontSize).toBe(64);
});

test('migrateTextLayer converts a pre-D3 layer into one span', () => {
  const migrated = textModel.migrateTextLayer({
    kind: 'text', text: 'Hello\nthere', fontFamily: 'serif', fontSize: 32, color: '#ff0000'
  });
  expect(migrated.text).toBe('Hello\nthere');
  expect(migrated.align).toBe('center');
  expect(migrated.spans.length).toBe(1);
  expect(migrated.spans[0]).toMatchObject({ start: 0, end: 11 });
  expect(migrated.spans[0].style).toMatchObject({
    fontFamily: 'serif', fontSize: 32, color: '#ff0000', tracking: 0
  });
  expect(migrated.spans[0].style.leading).toBeCloseTo(32 * 1.2, 6);
});

test('migrateTextLayer tolerates missing fields', () => {
  const migrated = textModel.migrateTextLayer({ kind: 'text' });
  expect(typeof migrated.text).toBe('string');
  expect(migrated.spans.length === 0 || migrated.spans[0].start === 0).toBe(true);
  expect(migrated.align).toBe('center');
});

test('a layer already carrying spans is passed through', () => {
  const spans = [{ start: 0, end: 2, style: textModel.defaultTextStyle() }];
  const migrated = textModel.migrateTextLayer({ kind: 'text', text: 'hi', spans, align: 'left' });
  expect(migrated.align).toBe('left');
  expect(migrated.spans.length).toBe(1);
  expect(migrated.spans[0].end).toBe(2);
});

test('cloneLayer deep-copies text spans', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createTextLayer(doc);
  const copy = documentModel.cloneLayer(doc, layer);
  if (copy.kind !== 'text') throw new Error('expected a text layer');
  expect(copy.spans).toEqual(layer.spans);
  expect(copy.spans).not.toBe(layer.spans);
  expect(copy.spans[0]).not.toBe(layer.spans[0]);
});
