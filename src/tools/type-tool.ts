import { type DocPoint, type Tool } from '../engine/tools';
import { icons } from '../dom';
import { state, notify } from '../state';
import { toast } from '../toast';
import * as history from '../engine/history';
import { cmdAddLayer } from '../engine/commands';
import { createTextLayer, layerNaturalSize } from '../engine/document';
import { hitTestLayer } from '../engine/transform-geometry';
import { isEditingSessionLive } from '../engine/session-status';
import { getTypeAlign, getTypeStyle } from './type-config';

export const typeTool: Tool = {
  id: 'type', label: 'Horizontal Type', icon: icons.type, cursor: 'text', shortcut: 't',

  onDown(p: DocPoint) {
    if (isEditingSessionLive()) { toast('Finish the current session before adding text.'); return; }

    // Clicking an existing text layer selects it instead of stacking a new one.
    const hit = state.doc.layers.find(
      (l) => l.kind === 'text' && l.visible && hitTestLayer(l, layerNaturalSize(l), p)
    );
    if (hit) {
      state.doc.activeLayerId = hit.id;
      notify('selection', 'composite');
      return;
    }

    const layer = createTextLayer(state.doc, undefined, getTypeStyle());
    layer.align = getTypeAlign();
    layer.x = p.x;
    layer.y = p.y;
    history.push(cmdAddLayer(layer, 0, 'Add text layer'));
  },

  onMove() {},
  onUp() {},
  options: []
};
