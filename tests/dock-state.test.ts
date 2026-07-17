import { beforeEach, expect, test } from 'vitest';
import { createDockState, type PanelDef } from '../src/shell/dock-state';

let dock: ReturnType<typeof createDockState>;

const defs: PanelDef[] = [
  { id: 'color', title: 'Color', stack: 1, order: 1, fkey: 'F6' },
  { id: 'swatches', title: 'Swatches', stack: 1, order: 2 },
  { id: 'properties', title: 'Properties', stack: 2, order: 1 },
  { id: 'adjustments', title: 'Adjustments', stack: 2, order: 2, phase: 'E' },
  { id: 'layers', title: 'Layers', stack: 3, order: 1, fkey: 'F7' },
  { id: 'history', title: 'History', stack: 3, order: 2 },
  { id: 'channels', title: 'Channels', stack: 3, order: 3, phase: 'E' },
  { id: 'paths', title: 'Paths', stack: 3, order: 4, phase: 'D' }
];

beforeEach(() => {
  dock = createDockState();
  defs.forEach((d) => dock.addPanel(d));
});

test('stacks list panels in order and default to the first real panel', () => {
  expect(dock.panelsInStack(3).map((p) => p.id)).toEqual(['layers', 'history', 'channels', 'paths']);
  expect(dock.activePanel(1)).toBe('color');
  expect(dock.activePanel(2)).toBe('properties');
  expect(dock.activePanel(3)).toBe('layers');
});

test('activation switches tabs but refuses phase stubs', () => {
  dock.activate('history');
  expect(dock.activePanel(3)).toBe('history');
  dock.activate('channels');
  expect(dock.activePanel(3)).toBe('history');
});

test('collapse toggles per stack and reset restores everything', () => {
  dock.toggleCollapsed(1);
  dock.toggleCollapsed(3);
  dock.activate('history');
  dock.setDockHidden(true);
  expect(dock.isCollapsed(1)).toBe(true);
  expect(dock.isDockHidden()).toBe(true);
  dock.reset();
  expect(dock.isCollapsed(1)).toBe(false);
  expect(dock.isCollapsed(3)).toBe(false);
  expect(dock.isDockHidden()).toBe(false);
  expect(dock.activePanel(3)).toBe('layers');
});

test('duplicate panel ids throw and changes notify', () => {
  expect(() => dock.addPanel(defs[0])).toThrow(/color/);
  let calls = 0;
  dock.onChange(() => { calls++; });
  dock.activate('swatches');
  dock.toggleCollapsed(2);
  expect(calls).toBe(2);
});
