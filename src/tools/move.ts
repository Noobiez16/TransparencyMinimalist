import { type Tool, type DocPoint, layerAt } from '../engine/tools';
import { getActiveLayer, state, notify } from '../state';
import { icons } from '../dom';
import { hitTestCanvasOverlay } from '../canvas-overlay';
import { getOverlayScale } from '../canvas';
import {
  beginHandleGesture,
  beginTransform,
  finishGesture,
  getTransformSession,
  interruptGesture,
  previewTransform
} from '../engine/transform-session';
import type { HandleId } from '../engine/transform-geometry';

const LINKED_HANDLES = new Set<HandleId>(['nw', 'ne', 'se', 'sw']);

export const moveTool: Tool = {
  id: 'move', label: 'Move', icon: icons.move, cursor: 'default', shortcut: 'v',
  onDown(p: DocPoint) {
    const active = getActiveLayer();
    const handle = active ? hitTestCanvasOverlay(state.doc, p, getOverlayScale()) : null;
    if (active && handle) {
      if (beginTransform(active.id, 'direct')) {
        beginHandleGesture(handle, p, LINKED_HANDLES.has(handle));
      }
      return;
    }

    const hit = layerAt(p);
    if (!hit) {
      state.doc.activeLayerId = null;
      notify('selection', 'composite');
      return;
    }
    if (state.doc.activeLayerId !== hit.id) {
      state.doc.activeLayerId = hit.id;
      notify('selection', 'composite');
    }
    if (beginTransform(hit.id, 'direct')) beginHandleGesture('move', p, false);
  },
  onMove(p: DocPoint, e: PointerEvent) {
    if (!getTransformSession()?.gesture) return;
    previewTransform(p, {
      shift: e.shiftKey,
      bypassSnap: e.ctrlKey || e.metaKey
    });
  },
  onUp() {
    finishGesture();
  },
  onCancel() {
    interruptGesture();
  }
};
