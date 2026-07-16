import { state, subscribe, getActiveLayer, PROP_DEFAULTS } from './state';
import { layerNaturalSize, type Layer, type Effects, type BlendMode, type LayerBase } from './engine/document';
import { $, icons, inlineEdit } from './dom';
import * as history from './engine/history';
import { cmdPatchLayer, cmdPatchEffects } from './engine/commands';
import {
  getTransformProportionsLinked,
  setTransformFieldValue,
  setTransformProportionsLinked,
  type TransformField
} from './tools/move';

// --- UI Rendering & Sync ---
const propertiesEditorContainer = $('properties-editor-container');
const noActiveWarning = $('no-active-warning');
const nameChip = $('prop-layer-name');

const propOpacityRange = $('prop-opacity') as HTMLInputElement;
const transformInputs: Record<TransformField, HTMLInputElement> = {
  x: $('prop-transform-x') as HTMLInputElement,
  y: $('prop-transform-y') as HTMLInputElement,
  width: $('prop-transform-width') as HTMLInputElement,
  height: $('prop-transform-height') as HTMLInputElement,
  rotation: $('prop-transform-rotation') as HTMLInputElement
};
const transformLink = $<HTMLButtonElement>('prop-transform-link');

const sectionTextProps = $('section-text-properties');
const propTextContent = $('prop-text-content') as HTMLTextAreaElement;
const propFontFamily = $('prop-font-family') as HTMLSelectElement;
const propFontSize = $('prop-font-size') as HTMLInputElement;
const propTextColor = $('prop-text-color') as HTMLInputElement;

const opacityValueEl = $('opacity-value');
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
  history.push(cmdPatchLayer(layer.id, `Blend: ${mode}`, { blendMode: mode as BlendMode }));
  syncBlendUI(mode);
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
      const patch: Partial<Effects> = { [fx.on]: nowOn } as Partial<Effects>;
      if (nowOn && fx.key === 'blur' && layer.effects.blur === 0) {
        (patch as Record<string, unknown>).blur = fx.firstOn; // first-time ON must visibly do something (spec §4)
      }
      history.push(cmdPatchEffects(layer.id, `Toggle ${fx.label}`, patch));
      syncEffectRow(fx.key, layer);
    });
    range.addEventListener('input', () => {
      const layer = getActiveLayer();
      if (!layer) return;
      const patch = { [fx.key]: parseInt(range.value, 10) } as Partial<Effects>;
      history.push(cmdPatchEffects(layer.id, `${fx.label}`, patch, `${layer.id}:fx:${fx.key}`));
      chip.textContent = `${range.value}${fx.unit}`;
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

function transformValue(layer: Layer, field: TransformField): number {
  if (field === 'width' || field === 'height') {
    const natural = layerNaturalSize(layer);
    return field === 'width'
      ? Math.abs(natural.w * layer.scaleX / 100)
      : Math.abs(natural.h * layer.scaleY / 100);
  }
  return layer[field];
}

function syncTransformFields(layer: Layer): void {
  for (const [field, input] of Object.entries(transformInputs) as Array<[TransformField, HTMLInputElement]>) {
    if (document.activeElement !== input) input.value = String(Math.round(transformValue(layer, field) * 100) / 100);
  }
  const linked = getTransformProportionsLinked();
  transformLink.setAttribute('aria-pressed', String(linked));
  transformLink.innerHTML = linked ? icons.link : icons.unlink;
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
  syncTransformFields(layer);

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

function bindSlider(input: HTMLInputElement, key: 'opacity', labelId?: string, suffix = ''): void {
  const labelEl = labelId ? $(labelId) : null;
  input.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (!layer) return;
    history.push(cmdPatchLayer(layer.id, key.charAt(0).toUpperCase() + key.slice(1), { [key]: parseInt(input.value, 10) } as Partial<LayerBase>, `${layer.id}:${key}`));
    if (labelEl) labelEl.textContent = `${input.value}${suffix}`;
  });
}

export function initPropertiesPanel(): void {
  buildEffectRows();

  // --- Active Layer Change Listeners ---
  nameChip.addEventListener('click', () => {
    const layer = getActiveLayer();
    if (!layer) return;
    inlineEdit(nameChip, layer.name, (v) => {
      history.push(cmdPatchLayer(layer.id, 'Rename layer', { name: v }));
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

  for (const [field, input] of Object.entries(transformInputs) as Array<[TransformField, HTMLInputElement]>) {
    const commit = () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) { const layer = getActiveLayer(); if (layer) syncTransformFields(layer); return; }
      const clamped = Math.min(Number(input.max), Math.max(Number(input.min), value));
      input.value = String(clamped);
      setTransformFieldValue(field, clamped);
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); input.blur(); }
      if (event.key === 'Escape') {
        event.preventDefault();
        // Blur FIRST: syncTransformFields skips the focused element to protect
        // live typing, so syncing before blur left the abandoned draft visible.
        input.blur();
        const layer = getActiveLayer();
        if (layer) syncTransformFields(layer);
      }
    });
  }
  transformLink.addEventListener('click', () => {
    setTransformProportionsLinked(!getTransformProportionsLinked());
    const layer = getActiveLayer();
    if (layer) syncTransformFields(layer);
  });

  $('prop-invert').addEventListener('click', () => {
    const layer = getActiveLayer();
    if (!layer) return;
    history.push(cmdPatchEffects(layer.id, 'Toggle Invert', { invert: !layer.effects.invert }));
    $('prop-invert').setAttribute('aria-checked', String(layer.effects.invert));
  });

  // Text layer change listeners
  propTextContent.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer && layer.kind === 'text') {
      history.push(cmdPatchLayer(layer.id, 'Edit text', { text: propTextContent.value }, `${layer.id}:text`));
    }
  });

  propFontFamily.addEventListener('change', () => {
    const layer = getActiveLayer();
    if (layer && layer.kind === 'text') {
      history.push(cmdPatchLayer(layer.id, 'Font family', { fontFamily: propFontFamily.value }));
    }
  });

  propFontSize.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer && layer.kind === 'text') {
      history.push(cmdPatchLayer(layer.id, 'Font size', { fontSize: parseInt(propFontSize.value, 10) }, `${layer.id}:fontSize`));
      fontSizeValueEl.textContent = `${propFontSize.value}px`;
    }
  });
  attachChip(propFontSize, fontSizeValueEl, 'px');
  attachReset(propFontSize, PROP_DEFAULTS.fontSize);

  propTextColor.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer && layer.kind === 'text') {
      history.push(cmdPatchLayer(layer.id, 'Text color', { color: propTextColor.value }, `${layer.id}:color`));
    }
  });

  subscribe((dirty) => {
    if (dirty.has('selection') || dirty.has('structure') || dirty.has('layerProps') || dirty.has('canvasConfig')) updateVisibility();
  });
  updateVisibility();
}
