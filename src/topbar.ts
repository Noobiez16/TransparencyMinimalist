import { state, notify, subscribe } from './state';
import { $ } from './dom';

const PRESETS: Record<string, [number, number]> = {
  '1:1': [1024, 1024], '16:9': [1920, 1080], '9:16': [1080, 1920], '4:5': [1080, 1350]
};

export function initTopbar(): void {
  const chip = $('size-chip');
  const menu = $('size-menu');
  const widthInput = $('canvas-width') as unknown as HTMLInputElement;
  const heightInput = $('canvas-height') as unknown as HTMLInputElement;

  chip.addEventListener('click', () => { menu.hidden = !menu.hidden; });
  document.addEventListener('click', (e) => {
    if (!chip.contains(e.target as Node) && !menu.contains(e.target as Node)) menu.hidden = true;
  });

  menu.querySelectorAll<HTMLButtonElement>('button[data-ratio]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ratio = btn.dataset.ratio!;
      const [w, h] = PRESETS[ratio];
      state.doc.width = w;
      state.doc.height = h;
      menu.hidden = true;
      notify('canvasConfig', 'composite');
    });
  });

  $('size-custom-apply').addEventListener('click', () => {
    state.doc.width = Math.min(4096, Math.max(64, parseInt(widthInput.value, 10) || 1024));
    state.doc.height = Math.min(4096, Math.max(64, parseInt(heightInput.value, 10) || 1024));
    menu.hidden = true;
    notify('canvasConfig', 'composite');
  });

  subscribe((dirty) => {
    if (dirty.has('canvasConfig')) {
      chip.textContent = `${state.doc.width} × ${state.doc.height} ▾`;
    }
  });
}
