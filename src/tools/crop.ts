import { type Tool, type DocPoint } from '../engine/tools';
import { icons } from '../dom';
import { getOverlayScale } from '../canvas';
import { hitTestCropOverlay } from '../canvas-overlay';
import {
  applyCrop,
  beginCrop,
  beginCropGesture,
  cancelCrop,
  finishCropGesture,
  getCropSession,
  interruptCropGesture,
  previewCrop,
  previewCropGesture,
  resetCrop,
  setCropRatio,
  type CropRatio,
  type CropRatioPreset
} from '../engine/crop-session';

const RATIO_CHOICES = ['free', 'original', '1:1', '4:5', '16:9', '9:16', 'custom'] as const;
type RatioChoice = (typeof RATIO_CHOICES)[number];

let customNumerator = 1;
let customDenominator = 1;

function currentRatioChoice(): RatioChoice {
  const ratio = getCropSession()?.ratio;
  if (ratio === undefined) return 'free';
  if (typeof ratio === 'object') return 'custom';
  return ratio;
}

function selectRatio(choice: string): void {
  if (!getCropSession()) return;
  const ratio: CropRatio = choice === 'custom'
    ? { numerator: customNumerator, denominator: customDenominator }
    : (choice as CropRatioPreset);
  setCropRatio(ratio);
}

function setCustomPart(part: 'numerator' | 'denominator', value: number): void {
  const next = Math.round(value);
  if (part === 'numerator') customNumerator = next;
  else customDenominator = next;
  if (currentRatioChoice() === 'custom') {
    setCropRatio({ numerator: customNumerator, denominator: customDenominator });
  }
}

function rectValue(field: 'width' | 'height'): number {
  const rect = getCropSession()?.rect;
  return rect ? Math.round(rect[field]) : 0;
}

const noSession = () => !getCropSession();
const customLocked = () => currentRatioChoice() !== 'custom';

export const cropTool: Tool = {
  id: 'crop',
  label: 'Crop',
  icon: icons.crop,
  cursor: 'crosshair',
  shortcut: 'c',
  onDown(p: DocPoint) {
    if (!getCropSession()) beginCrop();
    const handle = hitTestCropOverlay(p, getOverlayScale());
    if (handle) beginCropGesture(handle, p);
  },
  onMove(p: DocPoint) {
    if (getCropSession()?.gesture) previewCropGesture(p);
  },
  onUp() {
    finishCropGesture();
  },
  onCancel() {
    interruptCropGesture();
  },
  options: [
    {
      key: 'crop-ratio', label: 'Ratio', kind: 'select', group: 'geometry',
      choices: [...RATIO_CHOICES],
      get: currentRatioChoice,
      set: selectRatio,
      disabled: noSession
    },
    {
      key: 'crop-ratio-n', label: 'W part', kind: 'number', group: 'geometry', min: 1, max: 4096, step: 1,
      get: () => customNumerator,
      set: (value) => { setCustomPart('numerator', value); },
      disabled: customLocked
    },
    {
      key: 'crop-ratio-d', label: 'H part', kind: 'number', group: 'geometry', min: 1, max: 4096, step: 1,
      get: () => customDenominator,
      set: (value) => { setCustomPart('denominator', value); },
      disabled: customLocked
    },
    {
      key: 'crop-width', label: 'W', kind: 'number', group: 'geometry', min: 1, max: 4096, step: 1,
      get: () => rectValue('width'),
      set: (value) => { previewCrop({ width: value }); },
      disabled: noSession
    },
    {
      key: 'crop-height', label: 'H', kind: 'number', group: 'geometry', min: 1, max: 4096, step: 1,
      get: () => rectValue('height'),
      set: (value) => { previewCrop({ height: value }); },
      disabled: noSession
    },
    {
      key: 'crop-reset', label: 'Reset', kind: 'action', group: 'session', icon: icons.rotate,
      disabled: noSession,
      run: () => { resetCrop(); }
    },
    {
      key: 'crop-apply', label: 'Apply', kind: 'action', group: 'session', icon: icons.apply, essential: true,
      disabled: noSession,
      run: () => { applyCrop(); }
    },
    {
      key: 'crop-cancel', label: 'Cancel', kind: 'action', group: 'session', icon: icons.cancel, essential: true,
      disabled: noSession,
      run: () => { cancelCrop(); }
    }
  ]
};
