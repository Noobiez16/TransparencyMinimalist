import { state, subscribe, notify, getActiveLayer, PROP_DEFAULTS, type LayerState } from './state';
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

let lastSyncedLayerId: string | null = null;

type EffectKey = 'blur' | 'brightness' | 'contrast' | 'saturation';
const EFFECTS: { key: EffectKey; on: keyof LayerState; label: string; min: number; max: number; unit: string; firstOn: number; imageOnly: boolean }[] = [
  { key: 'blur', on: 'blurOn', label: 'Blur', min: 0, max: 20, unit: 'px', firstOn: 4, imageOnly: false },
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
          range.dispatchEvent(new Event('input'));
        }
      }
      input.replaceWith(chip);
      chip.textContent = `${range.value}${unit}`;
    };
    input.addEventListener('blur', () => commit(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit(true);
      if (e.key === 'Escape') commit(false);
    });
  });
}

function attachReset(range: HTMLInputElement, def: number): void {
  range.addEventListener('dblclick', () => {
    range.value = String(def);
    range.dispatchEvent(new Event('input'));
  });
}

function setBlend(mode: string): void {
  const layer = getActiveLayer();
  if (!layer) return;
  layer.blendMode = mode;
  syncBlendUI(mode);
  notify('layerProps');
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
      const nowOn = !(layer as any)[fx.on];
      (layer as any)[fx.on] = nowOn;
      if (nowOn && fx.key === 'blur' && layer.blur === 0) {
        layer.blur = fx.firstOn; // first-time ON must visibly do something (spec §4)
      }
      syncEffectRow(fx.key, layer);
      notify('layerProps');
    });
    range.addEventListener('input', () => {
      const layer = getActiveLayer();
      if (!layer) return;
      (layer as any)[fx.key] = parseInt(range.value, 10);
      chip.textContent = `${range.value}${fx.unit}`;
      notify('layerProps');
    });
  });
}

function syncEffectRow(key: EffectKey, layer: LayerState): void {
  const fx = EFFECTS.find((f) => f.key === key)!;
  const els = effectEls.get(key)!;
  const on = Boolean((layer as any)[fx.on]);
  els.sw.setAttribute('aria-checked', String(on));
  els.row.classList.toggle('on', on);
  if (document.activeElement !== els.range) els.range.value = String(layer[key]);
  els.chip.textContent = `${layer[key]}${fx.unit}`;
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
  $('opacity-value').textContent = `${layer.opacity}%`;
  syncBlendUI(layer.blendMode);
  syncVal(propXOffset, layer.xOffset.toString());
  $('x-offset-value').textContent = `${layer.xOffset}%`;
  syncVal(propYOffset, layer.yOffset.toString());
  $('y-offset-value').textContent = `${layer.yOffset}%`;
  syncVal(propScale, layer.scale.toString());
  $('scale-value').textContent = `${layer.scale}%`;

  EFFECTS.forEach((fx) => syncEffectRow(fx.key, layer));
  $('prop-invert').setAttribute('aria-checked', String(layer.invert));

  // Toggle filter rows based on type
  if (layer.type === 'image') {
    document.querySelectorAll('.filter-image-only').forEach((el) => {
      (el as HTMLElement).style.display = '';
    });
    sectionTextProps.style.display = 'none';
  } else {
    document.querySelectorAll('.filter-image-only').forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
    sectionTextProps.style.display = 'block';

    syncVal(propTextContent, layer.textContent);
    syncVal(propFontFamily, layer.fontFamily);
    syncVal(propFontSize, layer.fontSize.toString());
    $('font-size-value').textContent = `${layer.fontSize}px`;
    syncVal(propTextColor, layer.textColor);
  }
}

function updateVisibility(): void {
  if (state.activeLayerId) {
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

function bindSlider(input: HTMLInputElement, key: keyof LayerState, labelId?: string, suffix = ''): void {
  input.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (!layer) return;
    (layer as any)[key] = parseInt(input.value, 10);
    if (labelId) $(labelId).textContent = `${input.value}${suffix}`;
    notify('layerProps');
  });
}

export function initPropertiesPanel(): void {
  buildEffectRows();

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
  attachChip(propOpacityRange, $('opacity-value'), '%');
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

  bindSlider(propXOffset, 'xOffset', 'x-offset-value', '%');
  attachChip(propXOffset, $('x-offset-value'), '%');
  attachReset(propXOffset, PROP_DEFAULTS.xOffset);
  bindSlider(propYOffset, 'yOffset', 'y-offset-value', '%');
  attachChip(propYOffset, $('y-offset-value'), '%');
  attachReset(propYOffset, PROP_DEFAULTS.yOffset);
  bindSlider(propScale, 'scale', 'scale-value', '%');
  attachChip(propScale, $('scale-value'), '%');
  attachReset(propScale, PROP_DEFAULTS.scale);

  $('prop-invert').addEventListener('click', () => {
    const layer = getActiveLayer();
    if (!layer) return;
    layer.invert = !layer.invert;
    $('prop-invert').setAttribute('aria-checked', String(layer.invert));
    notify('layerProps');
  });

  // Text layer change listeners
  propTextContent.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer && layer.type === 'text') {
      layer.textContent = propTextContent.value;
      notify('layerProps');
    }
  });

  propFontFamily.addEventListener('change', () => {
    const layer = getActiveLayer();
    if (layer && layer.type === 'text') {
      layer.fontFamily = propFontFamily.value;
      notify('layerProps');
    }
  });

  bindSlider(propFontSize, 'fontSize', 'font-size-value', 'px');
  attachChip(propFontSize, $('font-size-value'), 'px');
  attachReset(propFontSize, PROP_DEFAULTS.fontSize);

  propTextColor.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer && layer.type === 'text') {
      layer.textColor = propTextColor.value;
      notify('layerProps');
    }
  });

  subscribe((dirty) => {
    if (dirty.has('selection') || dirty.has('structure')) updateVisibility();
  });
  updateVisibility();
}
