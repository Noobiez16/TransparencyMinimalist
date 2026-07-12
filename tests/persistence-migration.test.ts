import { beforeAll, describe, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');
let persistence: typeof import('../src/engine/persistence');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({ font: '', measureText: () => ({ width: 0 }) })
    })
  });
  documentModel = await import('../src/engine/document');
  persistence = await import('../src/engine/persistence');
});

function serialTextLayer(transform: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'text-1', name: 'Text', visible: true, opacity: 100, blendMode: 'normal',
    x: 50, y: 50, effects: documentModel.defaultEffects(), kind: 'text', text: 'Hello',
    fontFamily: 'Inter', fontSize: 64, color: '#000000', ...transform
  };
}

describe('project version migration', () => {
  test('version 1 uniform scale migrates to both axes and removes scale', () => {
    const migrated = persistence.migrateSerialLayer(serialTextLayer({ scale: 125 }), 1);

    expect(migrated).toMatchObject({ scaleX: 125, scaleY: 125, rotation: 0 });
    expect(migrated).not.toHaveProperty('scale');
  });

  test('version 2 affine values remain unchanged', () => {
    const raw = serialTextLayer({ scaleX: 120, scaleY: 80, rotation: -15 });

    expect(persistence.migrateSerialLayer(raw, 2)).toEqual(raw);
  });

  test('serialization writes version 2 in both envelope and document', async () => {
    const serialized = JSON.parse(await persistence.serializeDoc(documentModel.createDoc()));

    expect(serialized.version).toBe(2);
    expect(serialized.doc.version).toBe(2);
  });

  test('deserialization migrates a version 1 project without changing its uniform appearance', async () => {
    const json = JSON.stringify({
      app: 'minimalist-editor', version: 1,
      doc: {
        version: 1, width: 100, height: 100, bgType: 'transparent', bgColor: '#ffffff',
        activeLayerId: 'text-1', layers: [serialTextLayer({ scale: 125 })]
      }
    });

    const doc = await persistence.deserializeDoc(json);

    expect(doc.version).toBe(2);
    expect(doc.layers[0]).toMatchObject({ scaleX: 125, scaleY: 125, rotation: 0 });
    expect(doc.layers[0]).not.toHaveProperty('scale');
  });

  test('version 3 projects are rejected', async () => {
    const json = JSON.stringify({ app: 'minimalist-editor', version: 3, doc: { layers: [] } });

    await expect(persistence.deserializeDoc(json)).rejects.toThrow('newer version');
  });
});
