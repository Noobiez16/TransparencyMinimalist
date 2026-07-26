import { $, inlineEdit } from '../dom';
import { state, subscribe } from '../state';
import {
  addPath, deletePath, duplicateActivePath, renamePath, setActivePath, subscribePaths
} from '../engine/path-store';
import { pathBounds, pathToCommands } from '../engine/path-geometry';
import { replayPathCommands } from '../engine/path-render';
import type { PathItem } from '../engine/path-model';

const THUMB = 26;

function drawThumb(canvas: HTMLCanvasElement, path: PathItem): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, THUMB, THUMB);
  const bounds = pathBounds(path.subpaths);
  if (!bounds) return;
  const box = Math.max(bounds.w, bounds.h, 1);
  const scale = (THUMB - 4) / box;
  ctx.save();
  ctx.translate(THUMB / 2, THUMB / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(bounds.x + bounds.w / 2), -(bounds.y + bounds.h / 2));
  ctx.lineWidth = 1 / scale;
  ctx.strokeStyle = 'rgba(230, 233, 240, 0.95)';
  ctx.beginPath();
  replayPathCommands(ctx, pathToCommands(path.subpaths));
  ctx.stroke();
  ctx.restore();
}

function render(): void {
  const list = $('paths-list');
  list.textContent = '';
  for (const path of state.doc.paths) {
    const row = document.createElement('div');
    row.className = 'path-row';
    row.dataset.pathId = path.id;
    if (path.id === state.doc.activePathId) row.classList.add('active');

    const thumb = document.createElement('canvas');
    thumb.width = THUMB;
    thumb.height = THUMB;
    thumb.className = 'path-thumb';
    drawThumb(thumb, path);

    const name = document.createElement('span');
    name.className = 'path-name-label';
    name.textContent = path.name;
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      inlineEdit(name, path.name, (value) => renamePath(path.id, value));
    });

    row.append(thumb, name);
    row.addEventListener('click', () => setActivePath(path.id));
    list.appendChild(row);
  }
  $('btn-path-duplicate').toggleAttribute('disabled', !state.doc.activePathId);
  $('btn-path-delete').toggleAttribute('disabled', !state.doc.activePathId);
}

export function initPathsPanel(): void {
  $('btn-path-new').addEventListener('click', () => addPath(`Path ${state.doc.paths.length + 1}`));
  $('btn-path-duplicate').addEventListener('click', () => duplicateActivePath());
  $('btn-path-delete').addEventListener('click', () => {
    if (state.doc.activePathId) deletePath(state.doc.activePathId);
  });
  subscribePaths(render);
  subscribe((dirty) => { if (dirty.has('structure')) render(); });
  render();
}
