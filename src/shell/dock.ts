import { $ } from '../dom';
import { createDockState, type PanelDef } from './dock-state';
import { registerCommand } from './commands';
import { isTypingTarget, isTransformSessionGuardOpen } from '../transform-session-guard';

interface DockPanel extends PanelDef {
  elId?: string;
}

const state = createDockState();
const panelEls = new Map<string, HTMLElement>();
let mounted = false;

export function getDockState() {
  return state;
}

export function registerDockPanel(def: DockPanel): void {
  state.addPanel(def);
  if (!def.phase) {
    const el = $(def.elId ?? `panel-${def.id}`);
    panelEls.set(def.id, el);
    registerCommand({
      id: `window.panel.${def.id}`,
      label: def.title,
      shortcut: def.fkey,
      run: () => focusPanel(def.id)
    });
  }
  if (mounted) render();
}

export function focusPanel(id: string): void {
  document.querySelector('.dashboard-wrapper')?.classList.remove('hide-right');
  const def = state.panelsInStack(1).concat(state.panelsInStack(2), state.panelsInStack(3))
    .find((p) => p.id === id);
  if (!def) return;
  if (state.isCollapsed(def.stack)) state.toggleCollapsed(def.stack);
  state.activate(id);
}

function render(): void {
  ([1, 2, 3] as const).forEach((stack) => {
    const aside = document.querySelector<HTMLElement>(`.dock-stack[data-stack="${stack}"]`)!;
    const strip = aside.querySelector<HTMLElement>(`[data-tabs="${stack}"]`)!;
    const defs = state.panelsInStack(stack);
    aside.hidden = defs.length === 0;
    if (defs.length === 0) return;
    strip.replaceChildren();
    const activeId = state.activePanel(stack);
    for (const def of defs) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'dock-tab';
      tab.setAttribute('role', 'tab');
      tab.dataset.panel = def.id;
      tab.textContent = def.title;
      if (def.phase) {
        tab.disabled = true;
        tab.title = `Coming in Phase ${def.phase}`;
      } else {
        tab.addEventListener('click', () => state.activate(def.id));
      }
      tab.classList.toggle('active', def.id === activeId);
      tab.setAttribute('aria-selected', String(def.id === activeId));
      strip.appendChild(tab);
    }
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'dock-collapse';
    collapse.title = state.isCollapsed(stack) ? 'Expand' : 'Collapse';
    collapse.textContent = state.isCollapsed(stack) ? '▸' : '▾';
    collapse.addEventListener('click', () => state.toggleCollapsed(stack));
    strip.appendChild(collapse);
    aside.classList.toggle('collapsed', state.isCollapsed(stack));
    for (const def of defs) {
      if (def.phase) continue;
      const el = panelEls.get(def.id);
      if (el) el.hidden = def.id !== state.activePanel(stack);
    }
  });
}

export function initDock(): void {
  registerDockPanel({ id: 'properties', title: 'Properties', stack: 2, order: 1, elId: 'tab-properties' });
  registerDockPanel({ id: 'adjustments', title: 'Adjustments', stack: 2, order: 2, phase: 'E' });
  registerDockPanel({ id: 'layers', title: 'Layers', stack: 3, order: 1, fkey: 'F7' });
  registerDockPanel({ id: 'history', title: 'History', stack: 3, order: 2 });
  registerDockPanel({ id: 'channels', title: 'Channels', stack: 3, order: 3, phase: 'E' });
  registerDockPanel({ id: 'paths', title: 'Paths', stack: 3, order: 4, phase: 'D' });

  state.onChange(render);
  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(document.activeElement) || isTransformSessionGuardOpen()) return;
    if (e.key === 'F6') { e.preventDefault(); focusPanel('color'); }
    if (e.key === 'F7') { e.preventDefault(); focusPanel('layers'); }
  });
  mounted = true;
  render();
}
