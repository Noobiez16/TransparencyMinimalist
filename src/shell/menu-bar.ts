import { $ } from '../dom';
import { allCommands, getCommand, isCommandEnabled, runCommand, type CommandDef } from './commands';
import { isTypingTarget, isTransformSessionGuardOpen } from '../transform-session-guard';

export const MENUS: Array<{ title: string; items: Array<string | '—'> }> = [
  { title: 'File', items: ['file.new', 'file.open', 'file.place', '—', 'file.save', 'file.export'] },
  { title: 'Edit', items: ['edit.undo', 'edit.redo', '—', 'edit.freeTransform'] },
  { title: 'Image', items: ['image.canvasSize', 'image.imageSize', 'image.mode'] },
  { title: 'Layer', items: ['layer.newImage', 'layer.newText', '—', 'layer.duplicate', 'layer.delete', 'layer.group'] },
  { title: 'Type', items: ['type.rasterize', 'type.convertShape'] },
  { title: 'Select', items: ['select.all', 'select.deselect', 'select.reselect', 'select.inverse', 'select.subject'] },
  { title: 'Filter', items: ['filter.gallery', 'filter.gaussianBlur', 'filter.liquify'] },
  { title: 'View', items: ['view.zoomIn', 'view.zoomOut', 'view.fit', '—', 'view.snap'] },
  { title: 'Plugins', items: ['plugins.marketplace'] },
  { title: 'Window', items: ['window.panel.color', 'window.panel.swatches', 'window.panel.properties', 'window.panel.layers', 'window.panel.history', '—', 'workspace.reset'] },
  { title: 'Help', items: ['help.about'] }
];

let openMenu: HTMLElement | null = null;

function closeMenus(): void {
  openMenu?.remove();
  openMenu = null;
  document.querySelectorAll('.menu-heading.open').forEach((h) => h.classList.remove('open'));
}

function renderDropdown(heading: HTMLElement, items: Array<string | '—'>): void {
  closeMenus();
  heading.classList.add('open');
  const drop = document.createElement('div');
  drop.className = 'menu-dropdown glass-surface';
  for (const item of items) {
    if (item === '—') {
      const sep = document.createElement('div');
      sep.className = 'menu-separator';
      drop.appendChild(sep);
      continue;
    }
    const def: CommandDef | undefined = getCommand(item);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item';
    if (def?.legacyId) btn.id = def.legacyId;
    const check = def?.checked?.() ? '✓ ' : '';
    btn.innerHTML = `<span>${check}${def?.label ?? item}</span><span class="menu-shortcut">${def?.shortcut ?? ''}</span>`;
    const enabled = isCommandEnabled(item);
    btn.disabled = !enabled;
    if (def?.phase) btn.title = `Coming in Phase ${def.phase}`;
    if (enabled && def?.run) btn.addEventListener('click', () => { closeMenus(); runCommand(item); });
    else if (enabled && def?.legacyId) btn.addEventListener('click', () => closeMenus());
    drop.appendChild(btn);
  }
  heading.appendChild(drop);
  openMenu = drop;
}

export function initMenuBar(): void {
  const root = $('menu-root');
  for (const menu of MENUS) {
    const heading = document.createElement('div');
    heading.className = 'menu-heading';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-title';
    btn.textContent = menu.title;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (heading.classList.contains('open')) closeMenus();
      else renderDropdown(heading, menu.items);
    });
    heading.appendChild(btn);
    root.appendChild(heading);
  }
  document.addEventListener('click', (e) => {
    if (!(e.target as Element | null)?.closest?.('.menu-heading')) closeMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openMenu) { closeMenus(); return; }
    if (isTypingTarget(document.activeElement) || isTransformSessionGuardOpen()) return;
    const combo = `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key.length === 1 ? e.key.toUpperCase() : e.key}`;
    // Shortcuts display in Photoshop order ("Shift+Ctrl+D") — canonicalize before matching.
    const normalizeCombo = (s: string): string => {
      const parts = s.split('+');
      const key = parts.pop() ?? '';
      const mods = new Set(parts);
      return `${mods.has('Ctrl') ? 'Ctrl+' : ''}${mods.has('Shift') ? 'Shift+' : ''}${key.length === 1 ? key.toUpperCase() : key}`;
    };
    // Every registered bindKey command participates, whether or not a menu lists it (D/X live only on the toolbar chips).
    for (const def of allCommands()) {
      if (!def.bindKey || !def.shortcut || normalizeCombo(def.shortcut) !== combo) continue;
      if (!isCommandEnabled(def.id)) return;
      e.preventDefault();
      if (def.run) runCommand(def.id);
      else if (def.legacyId) document.getElementById(def.legacyId)?.click();
      return;
    }
  });
}
