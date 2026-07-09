import { type Tool, type DocPoint, layerAt } from '../engine/tools';
import { state, notify } from '../state';
import * as history from '../engine/history';
import { icons } from '../dom';

let drag: { id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null = null;

function clampX(v: number): number { return Math.max(-state.doc.width / 2, Math.min(1.5 * state.doc.width, Math.round(v))); }
function clampY(v: number): number { return Math.max(-state.doc.height / 2, Math.min(1.5 * state.doc.height, Math.round(v))); }

export const moveTool: Tool = {
  id: 'move', label: 'Move', icon: icons.move, cursor: 'default', shortcut: 'v',
  onDown(p: DocPoint) {
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
    drag = { id: hit.id, startX: p.x, startY: p.y, origX: hit.x, origY: hit.y, moved: false };
  },
  onMove(p: DocPoint) {
    if (!drag) return;
    const layer = state.doc.layers.find((l) => l.id === drag!.id);
    if (!layer) return;
    layer.x = clampX(drag.origX + (p.x - drag.startX));
    layer.y = clampY(drag.origY + (p.y - drag.startY));
    drag.moved = true;
    notify('layerProps', 'composite');
  },
  onUp() {
    if (drag && drag.moved) {
      const d = drag;
      const layer = state.doc.layers.find((l) => l.id === d.id);
      if (layer) {
        const fx = layer.x, fy = layer.y, ox = d.origX, oy = d.origY;
        history.push({
          label: 'Move layer',
          do() { const l = state.doc.layers.find((x) => x.id === d.id); if (l) { l.x = fx; l.y = fy; notify('layerProps', 'composite'); } },
          undo() { const l = state.doc.layers.find((x) => x.id === d.id); if (l) { l.x = ox; l.y = oy; notify('layerProps', 'composite'); } }
        });
      }
    }
    drag = null;
  }
};
