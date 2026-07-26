import { type DocPoint, type Tool } from '../engine/tools';
import { icons } from '../dom';
import { notify } from '../state';
import { toast } from '../toast';
import { getActivePath, replaceSubPaths } from '../engine/path-store';
import {
  hitTestAnchor, hitTestHandle, hitTestSegment,
  moveAnchor, moveHandle, setAnchorCorner, setAnchorSmooth, translateSubPath,
  type AnchorRef, type HandleRef
} from '../engine/path-geometry';
import { isEditingSessionLive } from '../engine/session-status';
import { setPathSelection } from '../canvas-overlay';
import { getOverlayScale } from '../canvas';

const HIT_PX = 7;
const hitRadius = () => HIT_PX / Math.max(0.01, getOverlayScale());

type Drag =
  | { kind: 'anchor'; ref: AnchorRef }
  | { kind: 'handle'; ref: HandleRef; mirror: boolean }
  | { kind: 'convert'; ref: AnchorRef }
  | { kind: 'subpath'; sub: number; last: DocPoint };

let drag: Drag | null = null;
let selected: AnchorRef | null = null;

function blocked(): boolean {
  if (!isEditingSessionLive()) return false;
  toast('Finish the current session before editing a path.');
  return true;
}

export const directSelectTool: Tool = {
  id: 'direct-select', label: 'Direct Selection', icon: icons.directSelect, cursor: 'default', shortcut: 'a',

  onDown(p: DocPoint, e: PointerEvent) {
    if (blocked()) return;
    const path = getActivePath();
    if (!path) return;
    const radius = hitRadius();

    const handle = hitTestHandle(path.subpaths, p, radius, selected);
    if (handle) {
      // Alt breaks the mirror so the two handles can point independently.
      drag = { kind: 'handle', ref: handle, mirror: !e.altKey };
      return;
    }
    const anchor = hitTestAnchor(path.subpaths, p, radius);
    if (anchor) {
      selected = anchor;
      setPathSelection(anchor);
      notify('composite');
      // Alt-dragging an anchor converts it between corner and smooth.
      drag = e.altKey ? { kind: 'convert', ref: anchor } : { kind: 'anchor', ref: anchor };
      return;
    }
    selected = null;
    setPathSelection(null);
    notify('composite');
  },

  onMove(p: DocPoint) {
    const path = getActivePath();
    if (!drag || !path) return;
    if (drag.kind === 'anchor') {
      replaceSubPaths(
        path.id, moveAnchor(path.subpaths, drag.ref, p.x, p.y),
        'Move anchor', `anchor:${path.id}:${drag.ref.sub}:${drag.ref.anchor}`
      );
    } else if (drag.kind === 'handle') {
      replaceSubPaths(
        path.id, moveHandle(path.subpaths, drag.ref, p.x, p.y, drag.mirror),
        'Move handle', `handle:${path.id}:${drag.ref.sub}:${drag.ref.anchor}:${drag.ref.which}`
      );
    } else if (drag.kind === 'convert') {
      const anchor = path.subpaths[drag.ref.sub]?.anchors[drag.ref.anchor];
      if (!anchor) return;
      const dx = p.x - anchor.x;
      const dy = p.y - anchor.y;
      const next = (dx === 0 && dy === 0)
        ? setAnchorCorner(path.subpaths, drag.ref)
        : setAnchorSmooth(path.subpaths, drag.ref, dx, dy);
      replaceSubPaths(path.id, next, 'Convert anchor', `convert:${path.id}:${drag.ref.sub}:${drag.ref.anchor}`);
    }
  },

  onUp() { drag = null; },
  onCancel() { drag = null; },
  options: []
};

export const pathSelectTool: Tool = {
  id: 'path-select', label: 'Path Selection', icon: icons.pathSelect, cursor: 'default', shortcut: '',

  onDown(p: DocPoint) {
    if (blocked()) return;
    const path = getActivePath();
    if (!path) return;
    const radius = hitRadius();
    const anchor = hitTestAnchor(path.subpaths, p, radius);
    const segment = anchor ? null : hitTestSegment(path.subpaths, p, radius);
    const sub = anchor?.sub ?? segment?.sub ?? null;
    if (sub === null) return;
    drag = { kind: 'subpath', sub, last: p };
    setPathSelection(null);
    notify('composite');
  },

  onMove(p: DocPoint) {
    const path = getActivePath();
    if (!drag || drag.kind !== 'subpath' || !path) return;
    const dx = p.x - drag.last.x;
    const dy = p.y - drag.last.y;
    if (dx === 0 && dy === 0) return;
    drag.last = p;
    replaceSubPaths(
      path.id, translateSubPath(path.subpaths, drag.sub, dx, dy),
      'Move path', `subpath:${path.id}:${drag.sub}`
    );
  },

  onUp() { drag = null; },
  onCancel() { drag = null; },
  options: []
};
