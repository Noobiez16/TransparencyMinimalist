import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { LayerTransform } from '../src/engine/document';

vi.mock('../src/canvas', () => ({ getOverlayScale: () => 1 }));

let documentModel: typeof import('../src/engine/document');
let history: typeof import('../src/engine/history');
let stateModule: typeof import('../src/state');
let sessions: typeof import('../src/engine/transform-session');
let overlay: typeof import('../src/canvas-overlay');
let geometry: typeof import('../src/engine/transform-geometry');
let move: typeof import('../src/tools/move');
let moveTool: typeof import('../src/tools/move').moveTool;
let tools: typeof import('../src/engine/tools');
let sessionGuard: typeof import('../src/transform-session-guard');

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
  history = await import('../src/engine/history');
  sessions = await import('../src/engine/transform-session');
  overlay = await import('../src/canvas-overlay');
  geometry = await import('../src/engine/transform-geometry');
  move = await import('../src/tools/move');
  moveTool = move.moveTool;
  tools = await import('../src/engine/tools');
  sessionGuard = await import('../src/transform-session-guard');
});

beforeEach(() => {
  sessions.cancelTransform();
  stateModule.state.doc = documentModel.createDoc(800, 600);
  history.clear();
  overlay.setShowTransformControls(true);
  move.setTransformProportionsLinked(true);
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

function addImageLayer() {
  const layer = documentModel.createImageLayer(stateModule.state.doc, 'Subject');
  layer.bitmap = { width: 100, height: 50 } as HTMLCanvasElement;
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  return layer;
}

describe('transform transaction lifecycle', () => {
  test('direct pointer completion creates exactly one reversible command', () => {
    const layer = addImageLayer();
    const before = transformOf(layer);

    expect(sessions.beginTransform(layer.id, 'direct')).toBe(true);
    expect(sessions.beginHandleGesture('move', { x: 400, y: 300 }, false)).toBe(true);
    sessions.previewTransform({ x: 455, y: 270 }, { shift: false, bypassSnap: false });

    expect(transformOf(layer)).toEqual({ ...before, x: before.x + 55, y: before.y - 30 });
    expect(history.entries()).toHaveLength(0);

    sessions.finishGesture();

    expect(history.entries()).toEqual([{ label: 'Transform layer' }]);
    expect(sessions.getTransformSession()).toBeNull();
    history.undo();
    expect(transformOf(layer)).toEqual(before);
  });

  test('explicit previews across multiple gestures commit only once on Apply', () => {
    const layer = addImageLayer();
    const before = transformOf(layer);

    expect(sessions.beginTransform(layer.id, 'explicit')).toBe(true);
    expect(sessions.beginHandleGesture('move', { x: 400, y: 300 }, false)).toBe(true);
    sessions.previewTransform({ x: 420, y: 315 }, { shift: false, bypassSnap: false });
    sessions.finishGesture();
    expect(history.entries()).toHaveLength(0);

    expect(sessions.beginHandleGesture('move', { x: 420, y: 315 }, false)).toBe(true);
    sessions.previewTransform({ x: 450, y: 325 }, { shift: false, bypassSnap: false });
    sessions.finishGesture();
    const after = transformOf(layer);
    expect(history.entries()).toHaveLength(0);

    expect(sessions.applyTransform()).toBe(true);
    expect(history.entries()).toEqual([{ label: 'Transform layer' }]);
    expect(transformOf(layer)).toEqual(after);
    history.undo();
    expect(transformOf(layer)).toEqual(before);
    history.redo();
    expect(transformOf(layer)).toEqual(after);
  });

  test('Cancel restores the exact session-start snapshot without history', () => {
    const layer = addImageLayer();
    layer.scaleX = 135.5;
    layer.scaleY = 62.25;
    layer.rotation = 347.75;
    const before = transformOf(layer);

    sessions.beginTransform(layer.id, 'explicit');
    sessions.beginHandleGesture('move', { x: 0, y: 0 }, false);
    sessions.previewTransform({ x: -22.5, y: 91.25 }, { shift: false, bypassSnap: false });

    expect(sessions.cancelTransform()).toBe(true);
    expect(transformOf(layer)).toEqual(before);
    expect(history.entries()).toHaveLength(0);
    expect(sessions.getTransformSession()).toBeNull();
  });

  test('pointer interruption restores the active gesture snapshot', () => {
    const layer = addImageLayer();
    const before = transformOf(layer);

    sessions.beginTransform(layer.id, 'direct');
    sessions.beginHandleGesture('move', { x: 10, y: 20 }, false);
    sessions.previewTransform({ x: 200, y: 240 }, { shift: false, bypassSnap: false });
    sessions.interruptGesture();

    expect(transformOf(layer)).toEqual(before);
    expect(history.entries()).toHaveLength(0);
    expect(sessions.getTransformSession()).toBeNull();
  });

  test('deleted and missing layers are handled without stale session state', () => {
    expect(sessions.beginTransform('missing', 'direct')).toBe(false);
    expect(sessions.getTransformSession()).toBeNull();

    const layer = addImageLayer();
    sessions.beginTransform(layer.id, 'direct');
    sessions.beginHandleGesture('move', { x: 0, y: 0 }, false);
    stateModule.state.doc.layers = [];

    expect(() => {
      sessions.previewTransform({ x: 20, y: 30 }, { shift: false, bypassSnap: false });
      sessions.finishGesture();
    }).not.toThrow();
    expect(sessions.getTransformSession()).toBeNull();
    expect(history.entries()).toHaveLength(0);
  });

  test('subscribers observe session transitions and can unsubscribe', () => {
    const layer = addImageLayer();
    const observed: Array<string | null> = [];
    const unsubscribe = sessions.subscribeTransformSession(() => {
      const session = sessions.getTransformSession();
      observed.push(session ? `${session.mode}:${session.gesture?.handle ?? 'idle'}` : null);
    });

    sessions.beginTransform(layer.id, 'direct');
    sessions.beginHandleGesture('move', { x: 0, y: 0 }, false);
    sessions.previewTransform({ x: 5, y: 7 }, { shift: false, bypassSnap: false });
    sessions.finishGesture();
    unsubscribe();
    sessions.beginTransform(layer.id, 'direct');

    expect(observed).toEqual(['direct:idle', 'direct:move', 'direct:move', null]);
  });

  test('published session state is a detached deep-readonly snapshot', () => {
    const layer = addImageLayer();
    sessions.beginTransform(layer.id, 'explicit');
    sessions.beginHandleGesture('move', { x: 12, y: 18 }, true);

    const published = sessions.getTransformSession();
    expect(published?.gesture).not.toBeNull();
    if (!published?.gesture) throw new Error('expected a gesture snapshot');

    (published.start as LayerTransform).x = -999;
    (published.current as LayerTransform).scaleX = -999;
    (published.gesture.startPointer as { x: number; y: number }).x = -999;
    (published.gesture.startTransform as LayerTransform).rotation = -999;
    (published.gesture.naturalSize as { w: number; h: number }).w = -999;

    const next = sessions.getTransformSession();
    expect(next?.start.x).toBe(layer.x);
    expect(next?.current.scaleX).toBe(layer.scaleX);
    expect(next?.gesture?.startPointer.x).toBe(12);
    expect(next?.gesture?.startTransform.rotation).toBe(layer.rotation);
    expect(next?.gesture?.naturalSize.w).toBe(100);
  });

  test('explicit field updates preview and commit through the active transaction', () => {
    const layer = addImageLayer();
    const before = transformOf(layer);
    sessions.beginTransform(layer.id, 'explicit');

    expect(sessions.updateTransform({ x: 450, scaleX: 125, rotation: 30 })).toBe(true);
    expect(transformOf(layer)).toEqual({ ...before, x: 450, scaleX: 125, rotation: 30 });
    expect(history.entries()).toHaveLength(0);

    sessions.applyTransform();
    expect(history.entries()).toEqual([{ label: 'Transform layer' }]);
    history.undo();
    expect(transformOf(layer)).toEqual(before);
  });
});

describe('canvas transform controls', () => {
  test('show-controls workspace state defaults on and remains toggleable', () => {
    expect(overlay.getShowTransformControls()).toBe(true);
    overlay.setShowTransformControls(false);
    expect(overlay.getShowTransformControls()).toBe(false);
  });

  test('hit targets and rotation offset remain constant in screen pixels', () => {
    const layer = addImageLayer();
    const scale = 2;
    const rotate = geometry.getHandlePoints(layer, { w: 100, h: 50 }, 32 / scale).rotate;

    expect(overlay.hitTestCanvasOverlay(stateModule.state.doc, rotate, scale)).toBe('rotate');
    expect(overlay.hitTestCanvasOverlay(
      stateModule.state.doc,
      { x: rotate.x + 11 / scale, y: rotate.y },
      scale
    )).toBeNull();
  });

  test('draws eight square handles and one rotation handle, but suppresses invalid targets', () => {
    const layer = addImageLayer();
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
      fillRect: vi.fn(), strokeRect: vi.fn(), arc: vi.fn(),
      strokeStyle: '', fillStyle: '', lineWidth: 0
    } as unknown as CanvasRenderingContext2D;

    overlay.drawCanvasOverlay(ctx, stateModule.state.doc, { overlayScale: 2 });
    expect(ctx.strokeRect).toHaveBeenCalledTimes(8);
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect(ctx.lineWidth).toBe(0.5);

    layer.visible = false;
    vi.mocked(ctx.strokeRect).mockClear();
    overlay.drawCanvasOverlay(ctx, stateModule.state.doc, { overlayScale: 2 });
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});

describe('Move tool transform delegation', () => {
  test('an explicit session accepts a handle gesture and remains open after pointerup', () => {
    const layer = addImageLayer();
    const event = { shiftKey: false, ctrlKey: false, metaKey: false } as PointerEvent;
    sessions.beginTransform(layer.id, 'explicit');

    moveTool.onDown({ x: 450, y: 325 }, event);
    expect(sessions.getTransformSession()?.gesture?.handle).toBe('se');
    moveTool.onMove({ x: 500, y: 350 }, event);
    moveTool.onUp({ x: 500, y: 350 }, event);

    expect(sessions.getTransformSession()?.mode).toBe('explicit');
    expect(sessions.getTransformSession()?.gesture).toBeNull();
    expect(history.entries()).toHaveLength(0);
    expect(layer.scaleX).toBe(150);
  });

  test('an explicit session accepts interior dragging without opening a direct session', () => {
    const layer = addImageLayer();
    const event = { shiftKey: false, ctrlKey: true, metaKey: false } as PointerEvent;
    sessions.beginTransform(layer.id, 'explicit');

    moveTool.onDown({ x: 400, y: 300 }, event);
    expect(sessions.getTransformSession()?.gesture?.handle).toBe('move');
    moveTool.onMove({ x: 430, y: 320 }, event);
    moveTool.onUp({ x: 430, y: 320 }, event);

    expect(sessions.getTransformSession()?.mode).toBe('explicit');
    expect(transformOf(layer)).toEqual({ x: 430, y: 320, scaleX: 100, scaleY: 100, rotation: 0 });
    expect(history.entries()).toHaveLength(0);
  });

  test('hits a corner handle before the layer interior and commits one resize command', () => {
    const layer = addImageLayer();
    const event = { shiftKey: false, ctrlKey: false, metaKey: false } as PointerEvent;

    moveTool.onDown({ x: 450, y: 325 }, event);
    moveTool.onMove({ x: 500, y: 350 }, event);
    moveTool.onUp({ x: 500, y: 350 }, event);

    expect(transformOf(layer)).toEqual({ x: 425, y: 312.5, scaleX: 150, scaleY: 150, rotation: 0 });
    expect(history.entries()).toEqual([{ label: 'Transform layer' }]);
  });

  test('pointer cancellation restores an interior drag instead of committing it', () => {
    const layer = addImageLayer();
    const before = transformOf(layer);
    const event = { shiftKey: false, ctrlKey: false, metaKey: false } as PointerEvent;

    moveTool.onDown({ x: 400, y: 300 }, event);
    moveTool.onMove({ x: 475, y: 360 }, event);
    moveTool.onCancel!({ x: 475, y: 360 }, event);

    expect(transformOf(layer)).toEqual(before);
    expect(history.entries()).toHaveLength(0);
  });

  test('unlinked proportions allow a corner handle to change one affine axis', () => {
    const layer = addImageLayer();
    const event = { shiftKey: false, ctrlKey: false, metaKey: false } as PointerEvent;
    move.setTransformProportionsLinked(false);

    moveTool.onDown({ x: 450, y: 325 }, event);
    moveTool.onMove({ x: 500, y: 325 }, event);
    moveTool.onUp({ x: 500, y: 325 }, event);

    expect(layer.scaleX).toBe(150);
    expect(layer.scaleY).toBe(100);
  });
});

describe('explicit-session keyboard routing', () => {
  const target = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable }) as Element;

  test('interactive controls keep Enter for their native activation semantics', () => {
    expect(sessionGuard.isInteractiveTarget(target('BUTTON'))).toBe(true);
    expect(sessionGuard.isInteractiveTarget(target('INPUT'))).toBe(true);
    expect(sessionGuard.getGuardKeyboardResolution('Enter', target('BUTTON'))).toBeNull();
  });

  test('the modal resolves keyboard commands only from non-interactive targets', () => {
    expect(sessionGuard.getGuardKeyboardResolution('Enter', target('SECTION'))).toBe('apply');
    expect(sessionGuard.getGuardKeyboardResolution('Escape', target('BUTTON'))).toBe('cancel');
  });
});

describe('captured pointer routing', () => {
  test('keeps move, release, and cancellation with the tool that received pointerdown', () => {
    const calls: string[] = [];
    const tool = (id: string): import('../src/engine/tools').Tool => ({
      id, label: id, icon: '', cursor: 'default', shortcut: id,
      onDown: () => calls.push(`${id}:down`),
      onMove: () => calls.push(`${id}:move`),
      onUp: () => calls.push(`${id}:up`),
      onCancel: () => calls.push(`${id}:cancel`)
    });
    const move = tool('move');
    const hand = tool('hand');
    let active = move;
    const router = tools.createToolPointerRouter(() => active);
    const point = { x: 0, y: 0 };
    const first = { pointerId: 1 } as PointerEvent;

    router.onDown(point, first);
    active = hand;
    router.onMove(point, first);
    router.onUp(point, first);

    active = move;
    const second = { pointerId: 2 } as PointerEvent;
    router.onDown(point, second);
    active = hand;
    router.onCancel(point, second);

    expect(calls).toEqual(['move:down', 'move:move', 'move:up', 'move:down', 'move:cancel']);
  });
});

describe('session concurrency guards (final review fixes)', () => {
  test('tool activation during a direct drag interrupts the gesture before proceeding', () => {
    const layer = addImageLayer();
    const before = transformOf(layer);

    sessions.beginTransform(layer.id, 'direct');
    sessions.beginHandleGesture('move', { x: layer.x, y: layer.y }, false);
    sessions.previewTransform({ x: layer.x + 60, y: layer.y }, { shift: false, bypassSnap: true });
    expect(layer.x).toBe(before.x + 60);

    let ran = false;
    const proceeded = sessionGuard.guardTransformSession(() => { ran = true; });

    expect(proceeded).toBe(true);
    expect(ran).toBe(true);
    expect(sessions.hasActiveTransformGesture()).toBe(false);
    expect(sessions.getTransformSession()).toBeNull();
    expect(transformOf(layer)).toEqual(before);
    expect(history.canUndo()).toBe(false);
  });

  test('explicit sessions without a live gesture still defer through the modal path', () => {
    const layer = addImageLayer();
    sessions.beginTransform(layer.id, 'explicit');

    let ran = false;
    let threw = false;
    try {
      sessionGuard.guardTransformSession(() => { ran = true; });
    } catch {
      threw = true; // modal path touches DOM ids that the unit stub does not provide
    }

    expect(ran).toBe(false);
    expect(threw).toBe(true);
    sessions.cancelTransform();
  });
});
