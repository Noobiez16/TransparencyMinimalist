import { state, subscribe, notify, getActiveLayer, type LayerState } from './state';
import { $ } from './dom';

// --- UI Rendering & Sync ---
const propertiesEditorContainer = $('properties-editor-container');
const noActiveWarning = $('no-active-warning');

const propNameInput = $('prop-name') as HTMLInputElement;
const propOpacityRange = $('prop-opacity') as HTMLInputElement;
const propOpacityNum = $('prop-opacity-num') as HTMLInputElement;
const propBlendSelect = $('prop-blend') as HTMLSelectElement;
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

  syncVal(propNameInput, layer.name);
  syncVal(propOpacityRange, layer.opacity.toString());
  syncVal(propOpacityNum, layer.opacity.toString());
  syncVal(propBlendSelect, layer.blendMode);
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
    syncPanel();
  } else {
    propertiesEditorContainer.style.display = 'none';
    noActiveWarning.style.display = 'block';
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
  propNameInput.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer) {
      layer.name = propNameInput.value;
      notify('layerProps');
    }
  });

  bindSlider(propOpacityRange, 'opacity');
  propOpacityRange.addEventListener('input', () => {
    propOpacityNum.value = propOpacityRange.value;
  });

  propOpacityNum.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer) {
      let val = parseInt(propOpacityNum.value, 10);
      if (isNaN(val)) val = 0;
      if (val < 0) val = 0;
      if (val > 100) val = 100;
      layer.opacity = val;
      propOpacityRange.value = val.toString();
      notify('layerProps');
    }
  });

  propBlendSelect.addEventListener('change', () => {
    const layer = getActiveLayer();
    if (layer) {
      layer.blendMode = propBlendSelect.value;
      notify('layerProps');
    }
  });

  bindSlider(propXOffset, 'xOffset', 'x-offset-value', '%');
  bindSlider(propYOffset, 'yOffset', 'y-offset-value', '%');
  bindSlider(propScale, 'scale', 'scale-value', '%');

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
