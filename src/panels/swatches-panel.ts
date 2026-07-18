import { $ } from '../dom';
import { getForeground, setForeground } from '../engine/color-state';

export const DEFAULT_SWATCHES = [
  '#000000', '#ffffff', '#e5484d', '#f76b15', '#ffc53d', '#30a46c',
  '#00b8d9', '#3e63dd', '#8e4ec6', '#e93d82', '#8d8d8d', '#f0f0f0'
];

const KEY = 'transparency.swatches';
const HEX = /^#[0-9a-f]{6}$/;

export function loadSwatches(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...DEFAULT_SWATCHES];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string' && HEX.test(v))) {
      return parsed as string[];
    }
  } catch { /* fall through */ }
  return [...DEFAULT_SWATCHES];
}

export function saveSwatches(list: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

export function initSwatchesPanel(): void {
  const host = $('panel-swatches');
  const render = () => {
    const swatches = loadSwatches();
    host.innerHTML = '<div class="swatch-grid"></div><button type="button" class="btn" id="swatch-add">+ Save current color</button>';
    const grid = host.querySelector('.swatch-grid')!;
    swatches.forEach((hex) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'swatch';
      (cell as HTMLElement).style.background = hex;
      cell.title = hex;
      cell.addEventListener('click', () => setForeground(hex));
      grid.appendChild(cell);
    });
    $('swatch-add').addEventListener('click', () => {
      const next = [...loadSwatches()];
      if (!next.includes(getForeground())) next.push(getForeground());
      saveSwatches(next);
      render();
    });
  };
  render();
}
