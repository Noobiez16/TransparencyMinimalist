import { beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('../src/canvas', () => ({ getOverlayScale: () => 1 }));

let documentModel: typeof import('../src/engine/document');
let snapping: typeof import('../src/engine/snap-engine');
let stateModule: typeof import('../src/state');
let sessions: typeof import('../src/engine/transform-session');
let overlay: typeof import('../src/canvas-overlay');
let move: typeof import('../src/tools/move');
let history: typeof import('../src/engine/history');
let tools: typeof import('../src/engine/tools');

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
  snapping = await import('../src/engine/snap-engine');
  stateModule = await import('../src/state');
  sessions = await import('../src/engine/transform-session');
  overlay = await import('../src/canvas-overlay');
  move = await import('../src/tools/move');
  history = await import('../src/engine/history');
  tools = await import('../src/engine/tools');
});

function resetIntegrationDoc() {
  sessions.cancelTransform();
  stateModule.state.doc = documentModel.createDoc(800, 600);
  history.clear();
  move.setSnapEnabled(true);
  overlay.clearActiveGuides();
}

function addImage(
  doc: import('../src/engine/document').Doc,
  id: string,
  options: { x: number; y: number; w?: number; h?: number; visible?: boolean }
) {
  const layer = documentModel.createImageLayer(doc, id);
  layer.id = id;
  layer.x = options.x;
  layer.y = options.y;
  layer.visible = options.visible ?? true;
  layer.bitmap = options.w === 0 || options.h === 0
    ? null
    : { width: options.w ?? 100, height: options.h ?? 100 } as HTMLCanvasElement;
  doc.layers.push(layer);
  return layer;
}

describe('snap candidate construction', () => {
  test('includes canvas and visible-layer edge and center anchors', () => {
    const doc = documentModel.createDoc(1000, 800);
    addImage(doc, 'active', { x: 500, y: 400 });
    addImage(doc, 'reference', { x: 200, y: 300, w: 200, h: 100 });

    const candidates = snapping.buildSnapCandidates(doc, 'active');

    expect(candidates.filter((item) => item.axis === 'x').map((item) => [item.value, item.source, item.anchor])).toEqual([
      [500, 'document', 'center'], [0, 'document', 'start'], [1000, 'document', 'end'],
      [100, 'layer', 'start'], [200, 'layer', 'center'], [300, 'layer', 'end']
    ]);
    expect(candidates.filter((item) => item.axis === 'y').map((item) => [item.value, item.source, item.anchor])).toEqual([
      [400, 'document', 'center'], [0, 'document', 'start'], [800, 'document', 'end'],
      [250, 'layer', 'start'], [300, 'layer', 'center'], [350, 'layer', 'end']
    ]);
  });

  test('excludes the active layer and hidden, empty, or invalid layers', () => {
    const doc = documentModel.createDoc(1000, 800);
    addImage(doc, 'active', { x: 100, y: 100 });
    addImage(doc, 'hidden', { x: 200, y: 200, visible: false });
    addImage(doc, 'empty', { x: 300, y: 300, w: 0 });
    const invalid = addImage(doc, 'invalid', { x: 400, y: 400 });
    invalid.x = Number.NaN;

    const candidates = snapping.buildSnapCandidates(doc, 'active');

    expect(candidates.every((item) => item.source === 'document')).toBe(true);
  });
});

describe('deterministic translation snapping', () => {
  test('prioritizes document center, then document edges, then stable layer order when corrections tie', () => {
    const candidates: import('../src/engine/snap-engine').SnapCandidate[] = [
      { axis: 'x', value: 0, source: 'layer', anchor: 'center', layerId: 'later', layerOrder: 2, start: 0, end: 20 },
      { axis: 'x', value: 0, source: 'layer', anchor: 'center', layerId: 'earlier', layerOrder: 1, start: 0, end: 20 },
      { axis: 'x', value: 20, source: 'document', anchor: 'start', layerOrder: -1, start: 0, end: 100 },
      { axis: 'x', value: 0, source: 'document', anchor: 'center', layerOrder: -1, start: 0, end: 100 }
    ];

    const centered = snapping.snapTranslation({ x: 10, y: 50, width: 0, height: 0, candidates, overlayScale: 1, screenPx: 20 });
    expect(centered.x).toBe(0);
    expect(centered.guides.find((guide) => guide.kind === 'alignment' && guide.axis === 'x')).toMatchObject({ source: 'document', anchor: 'center' });

    const layersOnly = snapping.snapTranslation({
      x: 10, y: 50, width: 0, height: 0, candidates: candidates.slice(0, 2), overlayScale: 1, screenPx: 1
    });
    expect(layersOnly.x).toBe(10);
    const tiedLayers = snapping.snapTranslation({
      x: 10, y: 50, width: 0, height: 0, candidates: candidates.slice(0, 2), overlayScale: 1, screenPx: 10
    });
    expect(tiedLayers.guides.find((guide) => guide.kind === 'alignment')).toMatchObject({ layerId: 'earlier' });
  });

  test.each([0.25, 1, 4])('converts a fixed screen threshold at overlay scale %s', (overlayScale) => {
    const candidates: import('../src/engine/snap-engine').SnapCandidate[] = [
      { axis: 'x', value: 100, source: 'document', anchor: 'center', layerOrder: -1, start: 0, end: 200 }
    ];
    const inside = snapping.snapTranslation({
      x: 100 + 3 / overlayScale, y: 0, width: 0, height: 0, candidates, overlayScale, screenPx: 4
    });
    const outside = snapping.snapTranslation({
      x: 100 + 5 / overlayScale, y: 0, width: 0, height: 0, candidates, overlayScale, screenPx: 4
    });

    expect(inside.x).toBe(100);
    expect(outside.x).toBeCloseTo(100 + 5 / overlayScale);
  });

  test('modifier bypass returns the proposal and no guide descriptors', () => {
    const result = snapping.snapTranslation({
      x: 98, y: 102, width: 0, height: 0,
      candidates: [
        { axis: 'x', value: 100, source: 'document', anchor: 'center', layerOrder: -1, start: 0, end: 200 },
        { axis: 'y', value: 100, source: 'document', anchor: 'center', layerOrder: -1, start: 0, end: 200 }
      ],
      overlayScale: 1,
      screenPx: 8,
      bypass: true
    });

    expect(result).toEqual({ x: 98, y: 102, guides: [] });
  });

  test('returns overlay-only alignment and measurement descriptors for active corrections', () => {
    const result = snapping.snapTranslation({
      x: 96, y: 50, width: 20, height: 10,
      candidates: [
        { axis: 'x', value: 100, source: 'layer', anchor: 'center', layerId: 'reference', layerOrder: 0, start: 20, end: 80 }
      ],
      overlayScale: 1,
      screenPx: 8
    });

    expect(result.x).toBe(100);
    expect(result.guides).toEqual([
      expect.objectContaining({ kind: 'alignment', axis: 'x', position: 100, start: 20, end: 80, layerId: 'reference' }),
      expect.objectContaining({ kind: 'measurement', axis: 'x', from: 96, to: 100, label: '4 px' })
    ]);
  });
});

describe('transform snapping and transient guide lifecycle', () => {
  test('exposes a lightweight gesture check without publishing the candidate cache', () => {
    resetIntegrationDoc();
    const active = addImage(stateModule.state.doc, 'active', { x: 300, y: 300 });
    stateModule.state.doc.activeLayerId = active.id;

    expect(sessions.hasActiveTransformGesture()).toBe(false);
    sessions.beginTransform(active.id, 'direct');
    sessions.beginHandleGesture('move', { x: 300, y: 300 }, false, { enabled: true, overlayScale: 1 });
    expect(sessions.hasActiveTransformGesture()).toBe(true);
    expect(sessions.getTransformSession()?.gesture).not.toHaveProperty('snap');
    sessions.interruptGesture();
  });

  test('caches candidates at gesture start and snaps Move previews to the cached geometry', () => {
    resetIntegrationDoc();
    const active = addImage(stateModule.state.doc, 'active', { x: 300, y: 300, w: 100, h: 50 });
    const reference = addImage(stateModule.state.doc, 'reference', { x: 500, y: 300, w: 100, h: 50 });
    stateModule.state.doc.activeLayerId = active.id;
    const event = { shiftKey: false, ctrlKey: false, metaKey: false } as PointerEvent;

    move.moveTool.onDown({ x: 300, y: 300 }, event);
    reference.x = 700;
    move.moveTool.onMove({ x: 498, y: 300 }, event);

    expect(active.x).toBe(500);
    expect(overlay.getActiveGuides().some((guide) => guide.kind === 'alignment' && guide.position === 500)).toBe(true);
  });

  test('Ctrl/Cmd bypass clears guides immediately and pointer completion leaves none stale', () => {
    resetIntegrationDoc();
    const active = addImage(stateModule.state.doc, 'active', { x: 300, y: 300, w: 100, h: 50 });
    addImage(stateModule.state.doc, 'reference', { x: 500, y: 300, w: 100, h: 50 });
    stateModule.state.doc.activeLayerId = active.id;
    const plain = { shiftKey: false, ctrlKey: false, metaKey: false } as PointerEvent;
    const bypass = { ...plain, ctrlKey: true } as PointerEvent;

    move.moveTool.onDown({ x: 300, y: 300 }, plain);
    move.moveTool.onMove({ x: 498, y: 300 }, plain);
    expect(overlay.getActiveGuides().length).toBeGreaterThan(0);

    move.moveTool.onMove({ x: 498, y: 300 }, bypass);
    expect(active.x).toBe(498);
    expect(overlay.getActiveGuides()).toEqual([]);
    move.moveTool.onUp({ x: 498, y: 300 }, bypass);
    expect(overlay.getActiveGuides()).toEqual([]);
  });

  test('snaps resize previews on the dragged edge and clears guides on interruption', () => {
    resetIntegrationDoc();
    const active = addImage(stateModule.state.doc, 'active', { x: 400, y: 300, w: 100, h: 50 });
    addImage(stateModule.state.doc, 'reference', { x: 550, y: 300, w: 100, h: 50 });
    stateModule.state.doc.activeLayerId = active.id;

    sessions.beginTransform(active.id, 'direct');
    sessions.beginHandleGesture('e', { x: 450, y: 300 }, false, { enabled: true, overlayScale: 1 });
    sessions.previewTransform({ x: 498, y: 300 }, { shift: false, bypassSnap: false });

    expect(active.x).toBe(425);
    expect(active.scaleX).toBe(150);
    expect(overlay.getActiveGuides().length).toBeGreaterThan(0);
    sessions.interruptGesture();
    expect(overlay.getActiveGuides()).toEqual([]);
  });

  test('Snap toggle drives behavior and Apply/Cancel clear transient guides', () => {
    resetIntegrationDoc();
    const active = addImage(stateModule.state.doc, 'active', { x: 300, y: 300, w: 100, h: 50 });
    addImage(stateModule.state.doc, 'reference', { x: 500, y: 300, w: 100, h: 50 });
    stateModule.state.doc.activeLayerId = active.id;
    const event = { shiftKey: false, ctrlKey: false, metaKey: false } as PointerEvent;

    move.setSnapEnabled(false);
    move.moveTool.onDown({ x: 300, y: 300 }, event);
    move.moveTool.onMove({ x: 498, y: 300 }, event);
    expect(active.x).toBe(498);
    expect(overlay.getActiveGuides()).toEqual([]);
    move.moveTool.onCancel!({ x: 498, y: 300 }, event);

    move.setSnapEnabled(true);
    sessions.beginTransform(active.id, 'explicit');
    sessions.beginHandleGesture('move', { x: 300, y: 300 }, false, { enabled: true, overlayScale: 1 });
    sessions.previewTransform({ x: 498, y: 300 }, { shift: false, bypassSnap: false });
    expect(overlay.getActiveGuides().length).toBeGreaterThan(0);
    sessions.finishGesture();
    sessions.applyTransform();
    expect(overlay.getActiveGuides()).toEqual([]);

    sessions.beginTransform(active.id, 'explicit');
    sessions.beginHandleGesture('move', { x: 500, y: 300 }, false, { enabled: true, overlayScale: 1 });
    sessions.previewTransform({ x: 498, y: 300 }, { shift: false, bypassSnap: false });
    sessions.cancelTransform();
    expect(overlay.getActiveGuides()).toEqual([]);
  });

  test('tool changes clear guides independently of pointer ownership', () => {
    resetIntegrationDoc();
    const dummy: import('../src/engine/tools').Tool = {
      id: 'snap-test-tool', label: 'Other', icon: '', cursor: 'default', shortcut: 'q',
      onDown: () => {}, onMove: () => {}, onUp: () => {}
    };
    tools.registerTool(move.moveTool);
    tools.registerTool(dummy);
    tools.setActiveTool('move');
    overlay.setActiveGuides([{
      kind: 'alignment', axis: 'x', position: 100, start: 0, end: 200,
      source: 'document', anchor: 'center', activeAnchor: 'center'
    }]);

    tools.setActiveTool(dummy.id);

    expect(overlay.getActiveGuides()).toEqual([]);
  });

  test('renders alignment and measurement guides at constant screen size', () => {
    resetIntegrationDoc();
    overlay.setShowTransformControls(false);
    overlay.setActiveGuides([
      {
        kind: 'alignment', axis: 'x', position: 100, start: 0, end: 200,
        source: 'document', anchor: 'center', activeAnchor: 'center'
      },
      { kind: 'measurement', axis: 'x', from: 96, to: 100, cross: 80, label: '4 px' }
    ]);
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), strokeText: vi.fn(), fillText: vi.fn(),
      strokeStyle: '', fillStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: ''
    } as unknown as CanvasRenderingContext2D;

    overlay.drawCanvasOverlay(ctx, stateModule.state.doc, { overlayScale: 2 });

    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.strokeText).toHaveBeenCalledWith('4 px', 98, 75);
    expect(ctx.fillText).toHaveBeenCalledWith('4 px', 98, 75);
    expect(ctx.font).toContain('5.5px');
    overlay.setShowTransformControls(true);
  });
});
