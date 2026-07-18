import { $ } from '../dom';
import { allTools, getActiveTool, onToolChange, setActiveTool } from '../engine/tools';
import { guardTransformSession } from '../transform-session-guard';
import { TOOL_GROUPS, type GroupEntry } from './toolbar-groups';

let doubleColumn = false;
let openFlyout: HTMLElement | null = null;

export function isToolbarDouble(): boolean { return doubleColumn; }

export function setToolbarColumns(double: boolean): void {
  doubleColumn = double;
  document.querySelector('.toolbar')?.classList.toggle('double', double);
}

function closeFlyout(): void {
  openFlyout?.remove();
  openFlyout = null;
}

function entryLabel(entry: GroupEntry): string {
  if ('tool' in entry) {
    const tool = allTools().find((t) => t.id === entry.tool);
    return tool ? `${tool.label} (${tool.shortcut.toUpperCase()})` : entry.tool;
  }
  return `${entry.stub} (${entry.key})`;
}

function openGroupFlyout(anchor: HTMLElement, entries: GroupEntry[]): void {
  closeFlyout();
  const fly = document.createElement('div');
  fly.className = 'tool-flyout glass-surface';
  for (const entry of entries) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tool-flyout-item';
    item.textContent = entryLabel(entry);
    if ('tool' in entry) {
      item.addEventListener('click', () => {
        closeFlyout();
        guardTransformSession(() => setActiveTool(entry.tool));
      });
    } else {
      item.disabled = true;
      item.title = `Coming in Phase ${entry.phase}`;
    }
    fly.appendChild(item);
  }
  anchor.appendChild(fly);
  openFlyout = fly;
}

function render(host: HTMLElement): void {
  host.replaceChildren();
  for (const group of TOOL_GROUPS) {
    const live = group.entries.filter((e): e is { tool: string } => 'tool' in e);
    const activeId = getActiveTool().id;
    const shown = live.find((e) => e.tool === activeId) ?? live[0] ?? null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rail-btn tool-group-btn';
    btn.dataset.group = group.id;
    if (shown) {
      const tool = allTools().find((t) => t.id === shown.tool)!;
      btn.dataset.tool = tool.id;
      btn.innerHTML = tool.icon;
      btn.title = entryLabel(shown);
      btn.classList.toggle('active', tool.id === activeId);
      btn.addEventListener('click', () => guardTransformSession(() => setActiveTool(tool.id)));
    } else {
      const first = group.entries[0] as { stub: string; key: string; phase: string };
      btn.disabled = true;
      btn.textContent = first.stub[0];
      btn.title = `${first.stub} — coming in Phase ${first.phase}`;
    }
    if (group.entries.length > 1) {
      btn.classList.add('has-siblings');
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openGroupFlyout(btn.parentElement as HTMLElement, group.entries);
      });
    }
    const wrap = document.createElement('div');
    wrap.className = 'tool-slot';
    wrap.appendChild(btn);
    host.appendChild(wrap);
  }
}

export function initToolbar(): void {
  const host = $('rail-tools');
  render(host);
  onToolChange(() => render(host));
  $('toolbar-columns').addEventListener('click', () => setToolbarColumns(!doubleColumn));
  document.addEventListener('click', (e) => {
    if (!(e.target as Element | null)?.closest?.('.tool-slot')) closeFlyout();
  });
}
