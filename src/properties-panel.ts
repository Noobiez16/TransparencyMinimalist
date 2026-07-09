import { state, subscribe, notify, getActiveLayer, PROP_DEFAULTS } from './state';
import type { Layer, Effects, BlendMode } from './engine/document';
import { $, inlineEdit } from './dom';

// --- UI Rendering & Sync ---
const propertiesEditorContainer = $('properties-editor-container');
const noActiveWarning = $('no-active-warning');
const nameChip = $('prop-layer-name');

const propOpacityRange = $('prop-opacity') as HTMLInputElement;
const propXOffset = $('prop-x-offset') as HTMLInputElement;
const propYOffset = $('prop-y-offset') as HTMLInputElement;
const propScale = $('prop-scale') as HTMLInputElement;

const sectionTextProps = $('section-text-properties');
const propTextContent = $('prop-text-content') as HTMLTextAreaElement;
const propFontFamily = $('prop-font-family') as HTMLSelectElement;
const propFontSize = $('prop-font-size') as HTMLInputElement;
const propTextColor = $('prop-text-color') as HTMLInputElement;

const opacityValueEl = $('opacity-value');
const xValueEl = $('x-offset-value');
const yValueEl = $('y-offset-value');
const scaleValueEl = $('scale-value');
const fontSizeValueEl = $('font-size-value');

let lastSyncedLayerId: string | null = null;

type EffectKey = 'blur' | 'brightness' | 'contrast' | 'saturation';
const EFFECTS: { key: EffectKey; on: keyof Effects; label: string; min: number; max: number; unit: string; firstOn: number; imageOnly: boolean }[] = [
  { key: 'blur', on: 'blurOn', label: 'Blur', min: 0, max: 100, unit: 'px', firstOn: 4, imageOnly: false },
  { key: 'brightness', on: 'brightnessOn', label: 'Brightness', min: 0, max: 200, unit: '%', firstOn: 100, imageOnly: true },
  { key: 'contrast', on: 'contrastOn', label: 'Contrast', min: 0, max: 200, unit: '%', firstOn: 100, imageOnly: true },
  { key: 'saturation', on: 'saturationOn', label: 'Saturation', min: 0, max: 200, unit: '%', firstOn: 100, imageOnly: true },
];

const effectEls = new Map<EffectKey, { row: HTMLElement; sw: HTMLButtonElement; range: HTMLInputElement; chip: HTMLElement }>();

function attachChip(range: HTMLInputElement, chip: HTMLElement, unit: string): void {
  chip.classList.add('value-chip');
  chip.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = range.min; input.max = range.max; input.value = range.value;
    input.className = 'chip-input';
    chip.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const commit = (apply: boolean) => {
      if (done) return; done = true;
      if (apply) {
        let v = parseInt(input.value, 10);
        if (!isNaN(v)) {
          v = Math.min(parseInt(range.max, 10), Math.max(parseInt(range.min, 10), v));
          range.value = String(v);
          input.replaceWith(chip);
          range.dispatchEvent(new Event('input'));
        } else {
          input.replaceWith(chip);
        }
      } else {
        input.replaceWith(chip);
      }
      chip.textContent = `${range.value}${unit}`;
    };
    input.addEventListener('blur', () => commit(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit(true);
      if (e.key === 'Escape') commit(false);
    });
  });
}

function attachReset(range: HTMLInputElement, def: number | (() => number)): void {
  range.addEventListener('dblclick', () => {
    const v = typeof def === 'function' ? def() : def;
    range.value = String(v);
    range.dispatchEvent(new Event('input'));
  });
}

function setBlend(mode: string): void {
  const layer = getActiveLayer();
  if (!layer) return;
  layer.blendMode = mode as BlendMode;
  syncBlendUI(mode);
  notify('layerProps', 'composite');
}

function syncBlendUI(mode: string): void {
  const alt = $('blend-alt') as HTMLButtonElement;
  if (mode !== 'normal' && mode !== alt.dataset.blend) {
    alt.dataset.blend = mode;
    alt.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  }
  document.querySelectorAll('#blend-seg button[data-blend]').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.blend === mode);
  });
}

function buildEffectRows(): void {
  const stack = $('effects-stack');
  EFFECTS.forEach((fx) => {
    const row = document.createElement('div');
    row.className = 'fx-row';
    row.dataset.fx = fx.key;
    if (fx.imageOnly) row.classList.add('filter-image-only');
    row.innerHTML = `
      <div class="fx-top">
        <span class="fx-name">${fx.label}</span>
        <button class="switch" role="switch" aria-checked="false"></button>
      </div>
      <div class="fx-body"><div class="fx-body-inner">
        <input type="range" min="${fx.min}" max="${fx.max}" value="${fx.min}">
        <span class="value-display value-chip">${fx.min}${fx.unit}</span>
      </div></div>`;
    stack.appendChild(row);
    const sw = row.querySelector('.switch') as HTMLButtonElement;
    const range = row.querySelector('input') as HTMLInputElement;
    const chip = row.querySelector('.value-chip') as HTMLElement;
    effectEls.set(fx.key, { row, sw, range, chip });
    attachChip(range, chip, fx.unit);
    attachReset(range, PROP_DEFAULTS[fx.key]);

    sw.addEventListener('click', () => {
      const layer = getActiveLayer();
      if (!layer) return;
      const effects = layer.effects as unknown as Record<string, number | boolean>;
      const nowOn = !effects[fx.on];
      effects[fx.on] = nowOn;
      if (nowOn && fx.key === 'blur' && layer.effects.blur === 0) {
        layer.effects.blur = fx.firstOn; // first-time ON must visibly do something (spec §4)
      }
      syncEffectRow(fx.key, layer);
      notify('layerProps', 'composite');
    });
    range.addEventListener('input', () => {
      const layer = getActiveLayer();
      if (!layer) return;
      const effects = layer.effects as unknown as Record<string, number | boolean>;
      effects[fx.key] = parseInt(range.value, 10);
      chip.textContent = `${range.value}${fx.unit}`;
      notify('layerProps', 'composite');
    });
  });
}

function syncEffectRow(key: EffectKey, layer: Layer): void {
  const fx = EFFECTS.find((f) => f.key === key)!;
  const els = effectEls.get(key)!;
  const on = Boolean(layer.effects[fx.on]);
  els.sw.setAttribute('aria-checked', String(on));
  els.row.classList.toggle('on', on);
  if (document.activeElement !== els.range) els.range.value = String(layer.effects[key]);
  els.chip.textContent = `${layer.effects[key]}${fx.unit}`;
}

function updateXYRange(): void {
  propXOffset.min = String(-state.doc.width / 2);
  propXOffset.max = String(1.5 * state.doc.width);
  propYOffset.min = String(-state.doc.height / 2);
  propYOffset.max = String(1.5 * state.doc.height);
}

function syncPanel(): void {
  const layer = getActiveLayer();
  if (!layer) return;

  const isLayerSwitched = lastSyncedLayerId !== layer.id;
  lastSyncedLayerId = layer.id;

  const syncVal = (inputEl: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, val: string) => {
    if (isLayerSwitched || document.activeElement !== inputEl) {
      inputEl.value = val;
    }
  };

  nameChip.textContent = layer.name;
  syncVal(propOpacityRange, layer.opacity.toString());
  opacityValueEl.textContent = `${layer.opacity}%`;
  syncBlendUI(layer.blendMode);
  syncVal(propXOffset, Math.round(layer.x).toString());
  xValueEl.textContent = `${Math.round(layer.x)}px`;
  syncVal(propYOffset, Math.round(layer.y).toString());
  yValueEl.textContent = `${Math.round(layer.y)}px`;
  syncVal(propScale, layer.scale.toString());
  scaleValueEl.textContent = `${layer.scale}%`;

  EFFECTS.forEach((fx) => syncEffectRow(fx.key, layer));
  $('prop-invert').setAttribute('aria-checked', String(layer.effects.invert));

  // Toggle filter rows based on type
  if (layer.kind === 'image') {
    document.querySelectorAll('.filter-image-only').forEach((el) => {
      (el as HTMLElement).style.display = '';
    });
    sectionTextProps.style.display = 'none';
  } else {
    document.querySelectorAll('.filter-image-only').forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
    sectionTextProps.style.display = 'block';

    syncVal(propTextContent, layer.text);
    syncVal(propFontFamily, layer.fontFamily);
    syncVal(propFontSize, layer.fontSize.toString());
    fontSizeValueEl.textContent = `${layer.fontSize}px`;
    syncVal(propTextColor, layer.color);
  }
}

function updateVisibility(): void {
  if (state.doc.activeLayerId) {
    propertiesEditorContainer.style.display = 'block';
    noActiveWarning.style.display = 'none';
    nameChip.style.display = '';
    syncPanel();
  } else {
    propertiesEditorContainer.style.display = 'none';
    noActiveWarning.style.display = 'block';
    nameChip.style.display = 'none';
  }
}

function bindSlider(input: HTMLInputElement, key: 'opacity' | 'x' | 'y' | 'scale', labelId?: string, suffix = ''): void {
  const labelEl = labelId ? $(labelId) : null;
  input.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (!layer) return;
    layer[key] = parseInt(input.value, 10);
    if (labelEl) labelEl.textContent = `${input.value}${suffix}`;
    notify('layerProps', 'composite');
  });
}

export function initPropertiesPanel(): void {
  buildEffectRows();
  updateXYRange();

  // --- Active Layer Change Listeners ---
  nameChip.addEventListener('click', () => {
    const layer = getActiveLayer();
    if (!layer) return;
    inlineEdit(nameChip, layer.name, (v) => {
      layer.name = v;
      notify('layerProps');
    });
  });

  bindSlider(propOpacityRange, 'opacity', 'opacity-value', '%');
  attachChip(propOpacityRange, opacityValueEl, '%');
  attachReset(propOpacityRange, PROP_DEFAULTS.opacity);

  document.querySelectorAll<HTMLButtonElement>('#blend-seg button[data-blend]').forEach((btn) => {
    btn.addEventListener('click', () => setBlend(btn.dataset.blend!));
  });
  const blendMenu = $('blend-menu');
  $('blend-more').addEventListener('click', () => { blendMenu.hidden = !blendMenu.hidden; });
  blendMenu.querySelectorAll<HTMLButtonElement>('button[data-blend]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setBlend(btn.dataset.blend!);
      blendMenu.hidden = true;
    });
  });
  document.addEventListener('click', (e) => {
    if (!$('blend-seg').contains(e.target as Node) && !blendMenu.contains(e.target as Node)) {
      blendMenu.hidden = true;
    }
  });

  bindSlider(propXOffset, 'x', 'x-offset-value', 'px');
  attachChip(propXOffset, xValueEl, 'px');
  attachReset(propXOffset, () => Math.round(state.doc.width / 2));
  bindSlider(propYOffset, 'y', 'y-offset-value', 'px');
  attachChip(propYOffset, yValueEl, 'px');
  attachReset(propYOffset, () => Math.round(state.doc.height / 2));
  bindSlider(propScale, 'scale', 'scale-value', '%');
  attachChip(propScale, scaleValueEl, '%');
  attachReset(propScale, PROP_DEFAULTS.scale);

  $('prop-invert').addEventListener('click', () => {
    const layer = getActiveLayer();
    if (!layer) return;
    layer.effects.invert = !layer.effects.invert;
    $('prop-invert').setAttribute('aria-checked', String(layer.effects.invert));
    notify('layerProps', 'composite');
  });

  // Text layer change listeners
  propTextContent.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer && layer.kind === 'text') {
      layer.text = propTextContent.value;
      notify('layerProps', 'composite');
    }
  });

  propFontFamily.addEventListener('change', () => {
    const layer = getActiveLayer();
    if (layer && layer.kind === 'text') {
      layer.fontFamily = propFontFamily.value;
      notify('layerProps', 'composite');
    }
  });

  propFontSize.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer && layer.kind === 'text') {
      layer.fontSize = parseInt(propFontSize.value, 10);
      fontSizeValueEl.textContent = `${propFontSize.value}px`;
      notify('layerProps', 'composite');
    }
  });
  attachChip(propFontSize, fontSizeValueEl, 'px');
  attachReset(propFontSize, PROP_DEFAULTS.fontSize);

  propTextColor.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer && layer.kind === 'text') {
      layer.color = propTextColor.value;
      notify('layerProps', 'composite');
    }
  });

  subscribe((dirty) => {
    if (dirty.has('canvasConfig')) updateXYRange();
    if (dirty.has('selection') || dirty.has('structure') || dirty.has('layerProps') || dirty.has('canvasConfig')) updateVisibility();
  });
  updateVisibility();
}
