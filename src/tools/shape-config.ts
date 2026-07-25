import { clampStrokeWidth } from '../engine/shape-geometry';

interface ShapeConfig {
  fillOn: boolean;
  strokeOn: boolean;
  strokeWidth: number;
  radius: number;
  sides: number;
}

const DEFAULTS: ShapeConfig = { fillOn: true, strokeOn: false, strokeWidth: 4, radius: 0, sides: 5 };

let config: ShapeConfig = { ...DEFAULTS };

export function getShapeSetting(key: 'fillOn' | 'strokeOn'): boolean { return config[key]; }

export function setShapeToggle(key: 'fillOn' | 'strokeOn', value: boolean): void {
  config[key] = Boolean(value);
}

export function getShapeNumber(key: 'strokeWidth' | 'radius' | 'sides'): number { return config[key]; }

export function setShapeNumber(key: 'strokeWidth' | 'radius' | 'sides', value: number): void {
  if (!Number.isFinite(value)) return;
  if (key === 'strokeWidth') { config.strokeWidth = clampStrokeWidth(value); return; }
  if (key === 'sides') { config.sides = Math.min(24, Math.max(3, Math.round(value))); return; }
  config.radius = Math.max(0, Math.round(value));
}

export function __resetShapeConfigForTest(): void { config = { ...DEFAULTS }; }
