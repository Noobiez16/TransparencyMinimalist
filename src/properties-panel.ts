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

const propBlur = $('prop-blur') as HTMLInputElement;
const propContrast = $('prop-contrast') as HTMLInputElement;
const propSaturation = $('prop-saturation') as HTMLInputElement;
const propBrightness = $('prop-brightness') as HTMLInputElement;
const propInvert = $('prop-invert') as HTMLInputElement;

const sectionTextProps = $('section-text-properties');
const propTextContent = $('prop-text-content') as HTMLTextAreaElement;
const propFontFamily = $('prop-font-family') as HTMLSelectElement;
const propFontSize = $('prop-font-size') as HTMLInputElement;
const propTextColor = $('prop-text-color') as HTMLInputElement;

let lastSyncedLayerId: string | null = null;

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

  syncVal(propBlur, layer.blur.toString());
  $('blur-value').textContent = `${layer.blur}px`;
  syncVal(propContrast, layer.contrast.toString());
  $('contrast-value').textContent = `${layer.contrast}%`;
  syncVal(propSaturation, layer.saturation.toString());
  $('saturation-value').textContent = `${layer.saturation}%`;
  syncVal(propBrightness, layer.brightness.toString());
  $('brightness-value').textContent = `${layer.brightness}%`;
  propInvert.checked = layer.invert;

  // Toggle filter rows based on type
  if (layer.type === 'image') {
    document.querySelectorAll('.filter-image-only').forEach((el) => {
      (el as HTMLElement).style.display = 'flex';
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
  bindSlider(propBlur, 'blur', 'blur-value', 'px');
  bindSlider(propContrast, 'contrast', 'contrast-value', '%');
  bindSlider(propSaturation, 'saturation', 'saturation-value', '%');
  bindSlider(propBrightness, 'brightness', 'brightness-value', '%');

  propInvert.addEventListener('change', () => {
    const layer = getActiveLayer();
    if (layer) {
      layer.invert = propInvert.checked;
      notify('layerProps');
    }
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
