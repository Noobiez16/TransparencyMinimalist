import { type DocPoint, type Tool, type ToolOption } from '../engine/tools';
import { icons } from '../dom';
import { state, notify } from '../state';
import { toast } from '../toast';
import * as history from '../engine/history';
import { cmdAddLayer, cmdPatchLayer } from '../engine/commands';
import { createTextLayer, layerNaturalSize, type TextLayer } from '../engine/document';
import { hitTestLayer } from '../engine/transform-geometry';
import { isEditingSessionLive } from '../engine/session-status';
import { applyStyleToRange, TEXT_FAMILIES, type TextAlign, type TextStyle } from '../engine/text-model';
import { getTypeAlign, getTypeStyle, setTypeAlign, setTypeStyle } from './type-config';

function activeTextLayer(): TextLayer | null {
  const layer = state.doc.layers.find((l) => l.id === state.doc.activeLayerId);
  return layer && layer.kind === 'text' ? layer : null;
}

/** Whole-layer style edit — the same span path D3b will narrow to a selection. */
function applyToSelectedText(patch: Partial<TextStyle>, label: string, key: string): void {
  const layer = activeTextLayer();
  if (!layer) return;
  history.push(cmdPatchLayer(
    layer.id, label,
    { spans: applyStyleToRange(layer.spans, 0, layer.text.length, patch, layer.text.length) },
    `${layer.id}:${key}`
  ));
}

function typeOptions(): ToolOption[] {
  return [
    {
      key: 'type-family', label: 'Font', kind: 'select', group: 'type',
      choices: [...TEXT_FAMILIES],
      get: () => activeTextLayer()?.spans[0]?.style.fontFamily ?? getTypeStyle().fontFamily,
      set: (v: string) => { setTypeStyle({ fontFamily: v }); applyToSelectedText({ fontFamily: v }, 'Font family', 'fontFamily'); }
    },
    {
      key: 'type-size', label: 'Size', kind: 'number', group: 'type',
      min: 8, max: 512, step: 1,
      get: () => activeTextLayer()?.spans[0]?.style.fontSize ?? getTypeStyle().fontSize,
      set: (v: number) => { setTypeStyle({ fontSize: v }); applyToSelectedText({ fontSize: v }, 'Font size', 'fontSize'); }
    },
    {
      key: 'type-align', label: 'Align', kind: 'select', group: 'type',
      choices: ['Left', 'Center', 'Right'],
      get: () => {
        const a = activeTextLayer()?.align ?? getTypeAlign();
        return a.charAt(0).toUpperCase() + a.slice(1);
      },
      set: (v: string) => {
        const align = v.toLowerCase() as TextAlign;
        setTypeAlign(align);
        const layer = activeTextLayer();
        if (layer) history.push(cmdPatchLayer(layer.id, 'Text alignment', { align }));
      }
    },
    {
      key: 'type-leading', label: 'Leading', kind: 'number', group: 'type',
      min: 1, max: 1000, step: 1,
      get: () => Math.round(activeTextLayer()?.spans[0]?.style.leading ?? getTypeStyle().leading),
      set: (v: number) => { setTypeStyle({ leading: v }); applyToSelectedText({ leading: v }, 'Leading', 'leading'); }
    },
    {
      key: 'type-tracking', label: 'Tracking', kind: 'number', group: 'type',
      min: -100, max: 500, step: 1,
      get: () => Math.round(activeTextLayer()?.spans[0]?.style.tracking ?? getTypeStyle().tracking),
      set: (v: number) => { setTypeStyle({ tracking: v }); applyToSelectedText({ tracking: v }, 'Tracking', 'tracking'); }
    }
  ];
}

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
  options: typeOptions()
};
