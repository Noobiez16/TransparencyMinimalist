import { state, subscribe } from './state';
import { $, icons } from './dom';
import * as history from './engine/history';
import { cmdPatchDoc } from './engine/commands';
import { saveProject, openProjectFile } from './engine/persistence';

const PRESETS: Record<string, [number, number]> = {
  '1:1': [1024, 1024], '16:9': [1920, 1080], '9:16': [1080, 1920], '4:5': [1080, 1350]
};

export function initTopbar(): void {
  const openBtn = $<HTMLButtonElement>('btn-open');
  const saveBtn = $<HTMLButtonElement>('btn-save');
  const projectInput = $('project-input') as unknown as HTMLInputElement;
  openBtn.innerHTML = icons.open;
  saveBtn.innerHTML = icons.save;
  openBtn.addEventListener('click', () => projectInput.click());
  saveBtn.addEventListener('click', () => void saveProject());
  projectInput.addEventListener('change', () => {
    const file = projectInput.files?.[0];
    projectInput.value = '';
    if (file) void openProjectFile(file);
  });

  const chip = $('size-chip');
  const statusSize = $('status-doc-size');
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
      history.push(cmdPatchDoc('Canvas size', { width: w, height: h }));
      menu.hidden = true;
    });
  });

  $('size-custom-apply').addEventListener('click', () => {
    const width = Math.min(4096, Math.max(64, parseInt(widthInput.value, 10) || 1024));
    const height = Math.min(4096, Math.max(64, parseInt(heightInput.value, 10) || 1024));
    history.push(cmdPatchDoc('Canvas size', { width, height }));
    menu.hidden = true;
  });

  const syncDimensions = () => {
    const dimensions = `${state.doc.width} × ${state.doc.height}`;
    chip.textContent = `${dimensions} ▾`;
    statusSize.textContent = dimensions;
    widthInput.value = String(state.doc.width);
    heightInput.value = String(state.doc.height);
  };

  subscribe((dirty) => {
    if (dirty.has('canvasConfig')) syncDimensions();
  });
  syncDimensions();
}
