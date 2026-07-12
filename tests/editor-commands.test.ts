import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DirtyFlag } from '../src/state';
import type { LayerTransform } from '../src/engine/document';

let commands: typeof import('../src/engine/commands');
let documentModel: typeof import('../src/engine/document');
let history: typeof import('../src/engine/history');
let stateModule: typeof import('../src/state');
let tools: typeof import('../src/engine/tools');

const dirtyBatches: Set<DirtyFlag>[] = [];

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
  commands = await import('../src/engine/commands');
  history = await import('../src/engine/history');
  tools = await import('../src/engine/tools');
  stateModule.subscribe((dirty) => dirtyBatches.push(new Set(dirty)));
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(800, 600);
  history.clear();
  dirtyBatches.length = 0;
});

function transformOf(layer: LayerTransform): LayerTransform {
  return {
    x: layer.x,
    y: layer.y,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    rotation: layer.rotation
  };
}

describe('reversible editor commands', () => {
  test('transform applies and reverses an exact five-field snapshot with command metadata', () => {
    const layer = documentModel.createTextLayer(stateModule.state.doc);
    stateModule.state.doc.layers.push(layer);
    const before = transformOf(layer);
    const after = { x: 125.25, y: -40.5, scaleX: 175, scaleY: 62.5, rotation: 327.75 };
    const command = commands.cmdTransformLayer(layer.id, before, after, 'Rotate selection', 'layer:transform');

    expect(command).toMatchObject({ label: 'Rotate selection', coalesceKey: 'layer:transform' });

    history.push(command);
    expect(transformOf(layer)).toEqual(after);
    expect(dirtyBatches.at(-1)).toEqual(new Set<DirtyFlag>(['layerProps', 'composite']));

    history.undo();
    expect(transformOf(layer)).toEqual(before);
    expect(dirtyBatches.at(-1)).toEqual(new Set<DirtyFlag>(['layerProps', 'composite']));

    history.redo();
    expect(transformOf(layer)).toEqual(after);
  });

  test('transform safely does nothing when its layer has disappeared', () => {
    const layer = documentModel.createTextLayer(stateModule.state.doc);
    stateModule.state.doc.layers.push(layer);
    const command = commands.cmdTransformLayer(
      layer.id,
      transformOf(layer),
      { x: 1, y: 2, scaleX: 3, scaleY: 4, rotation: 5 }
    );
    stateModule.state.doc.layers = [];

    history.push(command);
    history.undo();

    expect(stateModule.state.doc.layers).toEqual([]);
    expect(dirtyBatches).toEqual([]);
  });

  test('crop round-trips document geometry while tolerating added and removed layers', () => {
    const retained = documentModel.createImageLayer(stateModule.state.doc, 'Retained');
    const removed = documentModel.createTextLayer(stateModule.state.doc, 'Removed');
    const bitmap = { width: 320, height: 180 } as HTMLCanvasElement;
    retained.bitmap = bitmap;
    retained.x = 300;
    retained.y = 220;
    removed.x = 500;
    removed.y = 400;
    stateModule.state.doc.layers = [retained, removed];

    const before = {
      width: 800,
      height: 600,
      positions: {
        [retained.id]: { x: retained.x, y: retained.y },
        [removed.id]: { x: removed.x, y: removed.y }
      }
    };
    const after = {
      width: 480,
      height: 320,
      positions: {
        [retained.id]: { x: 140, y: 120 },
        [removed.id]: { x: 340, y: 300 }
      }
    };
    const command = commands.cmdCropDocument(before, after);
    const added = documentModel.createTextLayer(stateModule.state.doc, 'Added later');
    added.x = 77;
    added.y = 88;
    stateModule.state.doc.layers = [retained, added];

    history.push(command);
    expect({ width: stateModule.state.doc.width, height: stateModule.state.doc.height }).toEqual({ width: 480, height: 320 });
    expect({ x: retained.x, y: retained.y }).toEqual({ x: 140, y: 120 });
    expect({ x: added.x, y: added.y }).toEqual({ x: 77, y: 88 });
    expect(retained.bitmap).toBe(bitmap);
    expect(dirtyBatches.at(-1)).toEqual(new Set<DirtyFlag>(['canvasConfig', 'layerProps', 'composite']));

    history.undo();
    expect({ width: stateModule.state.doc.width, height: stateModule.state.doc.height }).toEqual({ width: 800, height: 600 });
    expect({ x: retained.x, y: retained.y }).toEqual({ x: 300, y: 220 });
    expect({ x: added.x, y: added.y }).toEqual({ x: 77, y: 88 });
    expect(retained.bitmap).toBe(bitmap);
    expect(dirtyBatches.at(-1)).toEqual(new Set<DirtyFlag>(['canvasConfig', 'layerProps', 'composite']));
  });

  test('command snapshots are isolated from caller mutations after construction', () => {
    const layer = documentModel.createTextLayer(stateModule.state.doc);
    stateModule.state.doc.layers.push(layer);
    const before = transformOf(layer);
    const after = { x: 10, y: 20, scaleX: 130, scaleY: 70, rotation: 45 };
    const transform = commands.cmdTransformLayer(layer.id, before, after);
    const cropBefore = { width: 800, height: 600, positions: { [layer.id]: { x: 400, y: 300 } } };
    const cropAfter = { width: 640, height: 480, positions: { [layer.id]: { x: 320, y: 240 } } };
    const crop = commands.cmdCropDocument(cropBefore, cropAfter);

    before.x = -999;
    after.x = 999;
    cropBefore.positions[layer.id].x = -999;
    cropAfter.positions[layer.id].x = 999;

    history.push(transform);
    expect(layer.x).toBe(10);
    history.undo();
    expect(layer.x).toBe(400);
    history.push(crop);
    expect(layer.x).toBe(320);
    history.undo();
    expect(layer.x).toBe(400);
  });
});

describe('layer selection regression', () => {
  test('selects the first visible topmost hit and skips a hidden top layer', () => {
    const hiddenTop = documentModel.createImageLayer(stateModule.state.doc, 'Hidden top');
    const visibleTop = documentModel.createImageLayer(stateModule.state.doc, 'Visible top');
    const visibleBottom = documentModel.createImageLayer(stateModule.state.doc, 'Visible bottom');
    for (const layer of [hiddenTop, visibleTop, visibleBottom]) {
      layer.bitmap = { width: 100, height: 100 } as HTMLCanvasElement;
      layer.x = 200;
      layer.y = 150;
    }
    hiddenTop.visible = false;
    stateModule.state.doc.layers = [hiddenTop, visibleTop, visibleBottom];

    expect(tools.layerAt({ x: 200, y: 150 })).toBe(visibleTop);
  });
});
