export type PaintToolId = 'brush' | 'pencil' | 'eraser';
export type PaintSettingKey = 'size' | 'hardness' | 'opacity';

interface PaintSettings { size: number; hardness: number; opacity: number }

const DEFAULTS: Record<PaintToolId, PaintSettings> = {
  brush: { size: 24, hardness: 50, opacity: 100 },
  pencil: { size: 4, hardness: 100, opacity: 100 },
  eraser: { size: 32, hardness: 100, opacity: 100 }
};

let settings: Record<PaintToolId, PaintSettings> = structuredClone(DEFAULTS);

function clamp(key: PaintSettingKey, value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS.brush[key];
  if (key === 'size') return Math.min(500, Math.max(1, Math.round(value)));
  if (key === 'hardness') return Math.min(100, Math.max(0, Math.round(value)));
  return Math.min(100, Math.max(1, Math.round(value)));
}

export function getPaintSetting(tool: PaintToolId, key: PaintSettingKey): number {
  return settings[tool][key];
}

export function setPaintSetting(tool: PaintToolId, key: PaintSettingKey, value: number): void {
  if (tool === 'pencil' && key === 'hardness') return; // pencil is always hard-edged
  settings[tool][key] = clamp(key, value);
}

/** Photoshop-style banded steps: 1px below 10, 5px below 50, 10px above. */
export function nudgeSize(tool: PaintToolId, direction: 1 | -1): void {
  const current = settings[tool].size;
  const step = current < 10 ? 1 : current < 50 ? 5 : 10;
  settings[tool].size = clamp('size', current + step * direction);
}

export function __resetPaintConfigForTest(): void {
  settings = structuredClone(DEFAULTS);
}
