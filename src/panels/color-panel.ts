import { $ } from '../dom';
import { getBackground, getForeground, setForeground, subscribeColors } from '../engine/color-state';

function channel(hex: string, i: number): number {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function initColorPanel(): void {
  const host = $('panel-color');
  host.innerHTML = `
    <div class="color-preview"><span class="color-preview-fg" id="color-preview-fg"></span><span class="color-preview-bg" id="color-preview-bg"></span></div>
    ${['R', 'G', 'B'].map((label, i) => `
      <label class="color-row">${label}
        <input type="range" min="0" max="255" data-channel="${i}" class="color-slider">
        <span class="color-value" data-value="${i}">0</span>
      </label>`).join('')}
    <label class="color-row">Hex <input type="text" id="color-hex" class="color-hex" maxlength="7"></label>`;
  const sliders = [...host.querySelectorAll<HTMLInputElement>('.color-slider')];
  const values = [...host.querySelectorAll<HTMLElement>('.color-value')];
  const hexInput = $('color-hex') as unknown as HTMLInputElement;
  const sync = () => {
    const fg = getForeground();
    sliders.forEach((s, i) => { s.value = String(channel(fg, i)); });
    values.forEach((v, i) => { v.textContent = String(channel(fg, i)); });
    if (document.activeElement !== hexInput) hexInput.value = fg;
    $('color-preview-fg').style.background = fg;
    $('color-preview-bg').style.background = getBackground();
  };
  sliders.forEach((slider) => slider.addEventListener('input', () => {
    setForeground(toHex(Number(sliders[0].value), Number(sliders[1].value), Number(sliders[2].value)));
  }));
  hexInput.addEventListener('change', () => setForeground(hexInput.value));
  subscribeColors(sync);
  sync();
}
