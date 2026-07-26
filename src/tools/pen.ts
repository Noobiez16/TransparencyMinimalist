import { type DocPoint, type Tool } from '../engine/tools';
import { icons } from '../dom';
import { notify } from '../state';
import { toast } from '../toast';
import { createAnchor, type SubPath } from '../engine/path-model';
import { ensureActivePath, getActivePath, replaceSubPaths } from '../engine/path-store';
import {
  deleteAnchor, hitTestAnchor, hitTestSegment, insertAnchorOnSegment
} from '../engine/path-geometry';
import { isEditingSessionLive } from '../engine/session-status';
import { setPathSelection } from '../canvas-overlay';
import { getOverlayScale } from '../canvas';

const HIT_PX = 7;
const hitRadius = () => HIT_PX / Math.max(0.01, getOverlayScale());

/** Index of the subpath the pen is currently extending, or null between paths. */
let activeSub: number | null = null;
let dragAnchor: number | null = null;

export function penInProgress(): boolean { return activeSub !== null; }

export function cancelPenPath(): void {
  const path = getActivePath();
  if (path && activeSub !== null) {
    const subs = path.subpaths.filter((_, i) => i !== activeSub);
    replaceSubPaths(path.id, subs, 'Discard path');
  }
  activeSub = null;
  dragAnchor = null;
  setPathSelection(null);
  notify('composite');
}

export function finishPenPath(): void {
  activeSub = null;
  dragAnchor = null;
  setPathSelection(null);
  notify('composite');
}

function currentSub(): SubPath | null {
  const path = getActivePath();
  if (!path || activeSub === null) return null;
  return path.subpaths[activeSub] ?? null;
}

export const penTool: Tool = {
  id: 'pen', label: 'Pen', icon: icons.pen, cursor: 'crosshair', shortcut: 'p',

  onDown(p: DocPoint, e: PointerEvent) {
    if (isEditingSessionLive()) { toast('Finish the current session before drawing a path.'); return; }
    const path = ensureActivePath();
    const radius = hitRadius();

    // Auto-delete: Alt-clicking an existing anchor removes it.
    if (e.altKey) {
      const hit = hitTestAnchor(path.subpaths, p, radius);
      if (hit) {
        replaceSubPaths(path.id, deleteAnchor(path.subpaths, hit), 'Delete anchor');
        setPathSelection(null);
        return;
      }
    }

    // Closing: clicking the first anchor of the subpath being drawn.
    const sub = currentSub();
    if (sub && sub.anchors.length >= 2) {
      const first = sub.anchors[0];
      if ((first.x - p.x) ** 2 + (first.y - p.y) ** 2 <= radius * radius) {
        const subs = path.subpaths.map((s, i) => (i === activeSub ? { ...s, closed: true } : s));
        replaceSubPaths(path.id, subs, 'Close path');
        finishPenPath();
        return;
      }
    }

    // Auto-add: clicking an existing segment inserts an anchor without changing the curve.
    if (!sub) {
      const segment = hitTestSegment(path.subpaths, p, radius);
      if (segment) {
        replaceSubPaths(path.id, insertAnchorOnSegment(path.subpaths, segment), 'Add anchor');
        setPathSelection({ sub: segment.sub, anchor: segment.segment + 1 });
        return;
      }
    }

    // Otherwise append an anchor, starting a subpath if needed.
    const subs = path.subpaths.map((s) => ({ closed: s.closed, anchors: s.anchors.map((a) => ({ ...a })) }));
    if (activeSub === null) {
      subs.push({ anchors: [createAnchor(p.x, p.y)], closed: false });
      activeSub = subs.length - 1;
    } else {
      subs[activeSub].anchors.push(createAnchor(p.x, p.y));
    }
    dragAnchor = subs[activeSub].anchors.length - 1;
    replaceSubPaths(path.id, subs, 'Add anchor');
    setPathSelection({ sub: activeSub, anchor: dragAnchor });
  },

  onMove(p: DocPoint) {
    if (activeSub === null || dragAnchor === null) return;
    const path = getActivePath();
    const sub = currentSub();
    if (!path || !sub) return;
    const anchor = sub.anchors[dragAnchor];
    if (!anchor) return;
    // Dragging after placing pulls symmetric handles, turning the corner into a smooth point.
    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    if (dx === 0 && dy === 0) return;
    const subs = path.subpaths.map((s, si) => ({
      closed: s.closed,
      anchors: s.anchors.map((a, ai) =>
        si === activeSub && ai === dragAnchor
          ? { ...a, outDx: dx, outDy: dy, inDx: -dx, inDy: -dy }
          : { ...a })
    }));
    replaceSubPaths(path.id, subs, 'Add anchor', `pen:${path.id}:${activeSub}:${dragAnchor}`);
  },

  onUp() { dragAnchor = null; },
  onCancel() { dragAnchor = null; },
  options: []
};
