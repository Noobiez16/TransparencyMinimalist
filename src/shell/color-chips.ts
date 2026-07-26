import { $ } from '../dom';
import { state, getActiveLayer } from '../state';
import * as history from '../engine/history';
import { cmdPatchDoc, cmdPatchLayer } from '../engine/commands';
import {
  getBackground, getForeground, resetColors, setBackground, setForeground,
  subscribeColors, swapColors
} from '../engine/color-state';
import { applyStyleToRange } from '../engine/text-model';

export function wireColorApplication(): void {
  subscribeColors(() => {
    const fg = getForeground();
    const layer = getActiveLayer();
    const currentColor = layer && layer.kind === 'text' && layer.spans.length
      ? layer.spans[0].style.color : null;
    if (layer && layer.kind === 'text' && currentColor !== fg) {
      history.push(cmdPatchLayer(
        layer.id, 'Text color',
        { spans: applyStyleToRange(layer.spans, 0, layer.text.length, { color: fg }, layer.text.length) },
        `${layer.id}:color`
      ));
    }
    const bg = getBackground();
    if (state.doc.bgType === 'custom' && state.doc.bgColor !== bg) {
      history.push(cmdPatchDoc('Background color', { bgColor: bg }, 'doc:bgColor'));
    }
  });
}

export function initColorChips(): void {
  const host = $('color-chips');
  host.innerHTML = `
    <div class="chip-pair" title="Foreground / Background (X swaps, D resets)">
      <input type="color" class="chip chip-fg" id="chip-foreground" aria-label="Foreground color">
      <input type="color" class="chip chip-bg" id="chip-background" aria-label="Background color">
    </div>
    <button type="button" class="chip-mini" id="chip-reset" title="Default colors (D)">▪</button>
    <button type="button" class="chip-mini" id="chip-swap" title="Swap colors (X)">⇄</button>`;
  const fgInput = $('chip-foreground') as unknown as HTMLInputElement;
  const bgInput = $('chip-background') as unknown as HTMLInputElement;
  const sync = () => { fgInput.value = getForeground(); bgInput.value = getBackground(); };
  fgInput.addEventListener('input', () => setForeground(fgInput.value));
  bgInput.addEventListener('input', () => setBackground(bgInput.value));
  $('chip-reset').addEventListener('click', () => resetColors());
  $('chip-swap').addEventListener('click', () => swapColors());
  subscribeColors(sync);
  sync();
}
