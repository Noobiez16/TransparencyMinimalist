# Photoshop Workspace Shell (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note:** DOM-heavy tasks end with a live browser verification via the preview (`.claude/launch.json` server `dev`, URL `http://localhost:3000/?audit-raf` — the query flag restores rAF in the hidden audit renderer). One browser pane per session → run inline. After any Vite HMR update, bare-URL dynamic imports return phantom module instances — hard-navigate before importing modules in verification snippets, or verify via DOM only.

**Goal:** Rebuild the UI shell to replicate the Photoshop Essentials workspace — eleven-menu bar, grouped toolbar with color chips, three tabbed right-dock stacks, document tab, diagnostics status bar, and workspace behaviors — per `docs/superpowers/specs/2026-07-17-photoshop-workspace-shell-design.md`.

**Architecture:** Command registry (`src/shell/commands.ts`) + dock framework (`src/shell/dock.ts`) as declarative foundations; menus, toolbar flyouts, and shortcuts consume them. Existing panels re-register by adopting their existing DOM nodes; existing engine modules stay untouched except one new `cloneLayer` helper. Legacy control ids (`#btn-open` etc.) move onto menu items so existing wiring and contracts keep working.

**Tech Stack:** Vanilla TypeScript + Vite, zero runtime deps. Vitest (`test:core`) with the established `vi.stubGlobal` bootstrap; node source contracts (`test:ui`); docs contracts (`test:docs`).

## Global Constraints

- ZERO runtime npm dependencies; no new dev dependencies.
- Keep the spatial-glass design language; replicate the manual's spatial architecture only.
- All eleven menu headings from day one; later-phase commands render disabled (grayed) with phase labels: Type (D), Select (C), Filter (E), Plugins (—), marquee/lasso (C), painting/eyedropper/retouch (B), pen/shapes (D), Channels (E), Paths (D), Adjustments (E), New Document / Image Size (F).
- Commits: subject only (conventional prefix), NO Co-Authored-By trailer; `git push origin main` after each task.
- All four gates before every commit: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`.
- Superseded `test:ui` contracts are replaced by equivalents asserting the new structure **in the same task** that changes the DOM — never deleted bare.
- Every mutating command wraps in `guardTransformSession`; every document-level shortcut respects `isTypingTarget` (`src/transform-session-guard.ts`) and does nothing while the session guard is open.
- Preserved feature ids (contract-tested): `btn-open`, `btn-save`, `btn-undo`, `btn-redo`, `btn-export` (become menu items), `options-host`, `size-chip`, `canvas-width`, `canvas-height`, `rail-tools`, `btn-add-image`, `btn-add-text`, `upload-zone`, `file-input`, `layers-list-container`, `canvas-container`, `canvas-viewport`, `doc-canvas`, `zoom-out`, `zoom-readout`, `zoom-in`, `bg-color-picker`, `tab-properties`, `properties-editor-container`, `history-list`. The ids `rail-add-image`, `rail-add-text`, `rail-layers`, `rail-props`, `layers-history-tabs`, `tab-layers`, `tab-history` are superseded (their functions move to menus/dock) — their contract entries are updated in the tasks that remove them.
- Workspace layout state is in-memory only; swatches persist in `localStorage` under key `transparency.swatches`.
- Out of scope: floating contextual task bar, tear-off panels, icon-collapse, cross-session layout persistence, Layers-panel blend/opacity controls, all Phase B–F features.

---

### Task 1: Command registry

**Files:**
- Create: `src/shell/commands.ts`
- Test: `tests/shell-commands.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (used by Tasks 5, 6, 7, 9, 13):
  - `interface CommandDef { id: string; label: string; shortcut?: string; bindKey?: boolean; checked?: () => boolean; legacyId?: string; enabled?: () => boolean; run?: () => void; phase?: 'B' | 'C' | 'D' | 'E' | 'F' }` — `bindKey: true` opts the shortcut into the global dispatcher (Task 5); `checked` renders a ✓ prefix in menus (used by View > Snap To).
  - `registerCommand(def: CommandDef): void` (throws `Error` on duplicate id)
  - `getCommand(id: string): CommandDef | undefined`
  - `isCommandEnabled(id: string): boolean` (false when missing, stubbed via `phase` with no `run`, or `enabled()` returns false)
  - `runCommand(id: string): boolean` (runs and returns true only when enabled and `run` exists)

- [ ] **Step 1: Write the failing test**

Create `tests/shell-commands.test.ts`:

```ts
import { beforeEach, expect, test } from 'vitest';
import {
  __resetCommandsForTest,
  getCommand,
  isCommandEnabled,
  registerCommand,
  runCommand
} from '../src/shell/commands';

beforeEach(() => {
  __resetCommandsForTest();
});

test('registers and runs an enabled command', () => {
  let ran = 0;
  registerCommand({ id: 'test.run', label: 'Run', run: () => { ran++; } });
  expect(getCommand('test.run')?.label).toBe('Run');
  expect(isCommandEnabled('test.run')).toBe(true);
  expect(runCommand('test.run')).toBe(true);
  expect(ran).toBe(1);
});

test('duplicate ids throw at registration', () => {
  registerCommand({ id: 'dup', label: 'A', run: () => {} });
  expect(() => registerCommand({ id: 'dup', label: 'B', run: () => {} })).toThrow(/dup/);
});

test('phase stubs without run are permanently disabled and inert', () => {
  registerCommand({ id: 'stub.marquee', label: 'Rectangular Marquee', shortcut: 'M', phase: 'C' });
  expect(isCommandEnabled('stub.marquee')).toBe(false);
  expect(runCommand('stub.marquee')).toBe(false);
});

test('enabled() gates both reporting and running', () => {
  let on = false;
  let ran = 0;
  registerCommand({ id: 'gated', label: 'Gated', enabled: () => on, run: () => { ran++; } });
  expect(isCommandEnabled('gated')).toBe(false);
  expect(runCommand('gated')).toBe(false);
  on = true;
  expect(isCommandEnabled('gated')).toBe(true);
  expect(runCommand('gated')).toBe(true);
  expect(ran).toBe(1);
});

test('missing commands report disabled and refuse to run', () => {
  expect(isCommandEnabled('nope')).toBe(false);
  expect(runCommand('nope')).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/shell-commands.test.ts`
Expected: FAIL — cannot find module `../src/shell/commands`.

- [ ] **Step 3: Implement**

Create `src/shell/commands.ts`:

```ts
export interface CommandDef {
  id: string;
  label: string;
  shortcut?: string;
  /** True when the global shortcut dispatcher should bind `shortcut`. Commands whose
   *  keys are already handled elsewhere (Ctrl+Z/T in main.ts) leave this unset and
   *  show the shortcut as display text only. */
  bindKey?: boolean;
  /** Renders a check prefix in menus when it returns true (e.g. View > Snap To). */
  checked?: () => boolean;
  /** When set, the menu bar renders this command's button with the given DOM id so
   *  existing modules (topbar/export/history wiring) can attach their listeners. */
  legacyId?: string;
  enabled?: () => boolean;
  run?: () => void;
  /** Roadmap phase for a not-yet-implemented command. A def with `phase` and no
   *  `run` is a permanent grayed stub. */
  phase?: 'B' | 'C' | 'D' | 'E' | 'F';
}

const commands = new Map<string, CommandDef>();

export function registerCommand(def: CommandDef): void {
  if (commands.has(def.id)) throw new Error(`Command already registered: ${def.id}`);
  commands.set(def.id, def);
}

export function getCommand(id: string): CommandDef | undefined {
  return commands.get(id);
}

export function isCommandEnabled(id: string): boolean {
  const def = commands.get(id);
  if (!def) return false;
  if (!def.run && !def.legacyId) return false;
  if (def.enabled && !def.enabled()) return false;
  return true;
}

export function runCommand(id: string): boolean {
  const def = commands.get(id);
  if (!def || !def.run || !isCommandEnabled(id)) return false;
  def.run();
  return true;
}

export function __resetCommandsForTest(): void {
  commands.clear();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/shell-commands.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

```bash
git add src/shell/commands.ts tests/shell-commands.test.ts
git commit -m "feat: add the workspace command registry"
git push origin main
```

---

### Task 2: Foreground/background color state

**Files:**
- Create: `src/engine/color-state.ts`
- Test: `tests/color-state.test.ts`

**Interfaces:**
- Consumes: nothing (pure module; deliberately engine-level so Phase B brushes can consume it).
- Produces (used by Tasks 9, 10):
  - `getForeground(): string` / `getBackground(): string` (lower-case `#rrggbb`)
  - `setForeground(hex: string): void` / `setBackground(hex: string): void` (invalid hex ignored)
  - `swapColors(): void` — the X shortcut
  - `resetColors(): void` — the D shortcut → foreground `#000000`, background `#ffffff`
  - `subscribeColors(fn: () => void): void`

- [ ] **Step 1: Write the failing test**

Create `tests/color-state.test.ts`:

```ts
import { beforeEach, expect, test } from 'vitest';
import {
  getBackground,
  getForeground,
  resetColors,
  setBackground,
  setForeground,
  subscribeColors,
  swapColors
} from '../src/engine/color-state';

beforeEach(() => {
  resetColors();
});

test('defaults are black foreground over white background', () => {
  expect(getForeground()).toBe('#000000');
  expect(getBackground()).toBe('#ffffff');
});

test('set, swap, and reset drive both chips', () => {
  setForeground('#E5484D');
  setBackground('#30a46c');
  expect(getForeground()).toBe('#e5484d');
  expect(getBackground()).toBe('#30a46c');
  swapColors();
  expect(getForeground()).toBe('#30a46c');
  expect(getBackground()).toBe('#e5484d');
  resetColors();
  expect(getForeground()).toBe('#000000');
  expect(getBackground()).toBe('#ffffff');
});

test('invalid hex values are ignored', () => {
  setForeground('#12');
  setForeground('red');
  expect(getForeground()).toBe('#000000');
});

test('subscribers fire on every change', () => {
  let calls = 0;
  subscribeColors(() => { calls++; });
  setForeground('#123456');
  swapColors();
  resetColors();
  expect(calls).toBe(3);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/color-state.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/engine/color-state.ts`:

```ts
type Listener = () => void;

let foreground = '#000000';
let background = '#ffffff';
const listeners: Listener[] = [];

const HEX = /^#[0-9a-f]{6}$/;

function normalize(hex: string): string | null {
  const value = hex.trim().toLowerCase();
  return HEX.test(value) ? value : null;
}

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function getForeground(): string { return foreground; }
export function getBackground(): string { return background; }

export function setForeground(hex: string): void {
  const value = normalize(hex);
  if (!value) return;
  foreground = value;
  emit();
}

export function setBackground(hex: string): void {
  const value = normalize(hex);
  if (!value) return;
  background = value;
  emit();
}

export function swapColors(): void {
  [foreground, background] = [background, foreground];
  emit();
}

export function resetColors(): void {
  foreground = '#000000';
  background = '#ffffff';
  emit();
}

export function subscribeColors(fn: Listener): void {
  listeners.push(fn);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/color-state.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

```bash
git add src/engine/color-state.ts tests/color-state.test.ts
git commit -m "feat: add foreground/background color state"
git push origin main
```

---

### Task 3: Dock state machine

**Files:**
- Create: `src/shell/dock-state.ts`
- Test: `tests/dock-state.test.ts`

**Interfaces:**
- Consumes: nothing (pure state machine; the DOM half arrives in Task 4).
- Produces (used by Tasks 4, 13):
  - `interface PanelDef { id: string; title: string; stack: 1 | 2 | 3; order: number; fkey?: string; phase?: 'B' | 'C' | 'D' | 'E' | 'F' }` (a def with `phase` is a grayed tab stub)
  - `createDockState()` returning:
    - `addPanel(def: PanelDef): void` (throws on duplicate id)
    - `panelsInStack(stack: 1 | 2 | 3): PanelDef[]` (sorted by `order`)
    - `activePanel(stack): string | null` / `activate(id): void` (stub tabs cannot activate)
    - `isCollapsed(stack): boolean` / `toggleCollapsed(stack): void`
    - `isDockHidden(): boolean` / `setDockHidden(hidden: boolean): void`
    - `reset(): void` — expand all stacks, dock visible, first non-stub panel of each stack active
    - `onChange(fn: () => void): void`

- [ ] **Step 1: Write the failing test**

Create `tests/dock-state.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/dock-state.test.ts` — Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

Create `src/shell/dock-state.ts`:

```ts
export interface PanelDef {
  id: string;
  title: string;
  stack: 1 | 2 | 3;
  order: number;
  fkey?: string;
  /** Roadmap phase for a not-yet-implemented panel — renders as a grayed tab. */
  phase?: 'B' | 'C' | 'D' | 'E' | 'F';
}

export function createDockState() {
  const panels = new Map<string, PanelDef>();
  const active = new Map<1 | 2 | 3, string>();
  const collapsed = new Set<1 | 2 | 3>();
  let dockHidden = false;
  const listeners: Array<() => void> = [];

  const emit = () => listeners.forEach((fn) => fn());

  function panelsInStack(stack: 1 | 2 | 3): PanelDef[] {
    return [...panels.values()].filter((p) => p.stack === stack).sort((a, b) => a.order - b.order);
  }

  function firstReal(stack: 1 | 2 | 3): string | null {
    return panelsInStack(stack).find((p) => !p.phase)?.id ?? null;
  }

  return {
    addPanel(def: PanelDef): void {
      if (panels.has(def.id)) throw new Error(`Panel already registered: ${def.id}`);
      panels.set(def.id, def);
      if (!def.phase && !active.has(def.stack)) active.set(def.stack, def.id);
    },
    panelsInStack,
    activePanel(stack: 1 | 2 | 3): string | null {
      return active.get(stack) ?? null;
    },
    activate(id: string): void {
      const def = panels.get(id);
      if (!def || def.phase) return;
      active.set(def.stack, id);
      emit();
    },
    isCollapsed(stack: 1 | 2 | 3): boolean {
      return collapsed.has(stack);
    },
    toggleCollapsed(stack: 1 | 2 | 3): void {
      if (collapsed.has(stack)) collapsed.delete(stack);
      else collapsed.add(stack);
      emit();
    },
    isDockHidden(): boolean {
      return dockHidden;
    },
    setDockHidden(hidden: boolean): void {
      dockHidden = hidden;
      emit();
    },
    reset(): void {
      collapsed.clear();
      dockHidden = false;
      ([1, 2, 3] as const).forEach((stack) => {
        const first = firstReal(stack);
        if (first) active.set(stack, first);
      });
      emit();
    },
    onChange(fn: () => void): void {
      listeners.push(fn);
    }
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/dock-state.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

```bash
git add src/shell/dock-state.ts tests/dock-state.test.ts
git commit -m "feat: add the dock stack state machine"
git push origin main
```

---

### Task 4: Dock DOM — three tabbed stacks replace the two right panels

**Files:**
- Create: `src/shell/dock.ts`
- Modify: `index.html:102-231` (right-dock region), `src/history-panel.ts` (remove tab-switching code), `src/main.ts` (call `initDock()` after panel inits), `src/style.css` (dock stack rules; remove `.dock-heading`/old dock rules), `tests/ui-layout.test.mjs` (replace superseded contracts)
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `createDockState`, `PanelDef` (Task 3); `registerCommand` (Task 1); `isTypingTarget` (`src/transform-session-guard.ts`).
- Produces (used by Tasks 6, 10, 13):
  - `initDock(): void` — builds tab strips, wires collapse, F6/F7 keys, registers `window.panel.<id>` focus commands for real panels.
  - `registerDockPanel(def: PanelDef & { elId?: string }): void` — `elId` names an existing DOM node to use as the panel body (defaults to `panel-<id>`); phase-stub defs render grayed tabs with no body.
  - `focusPanel(id: string): void` — activates the tab, expands its stack, unhides the dock (removes `.hide-right` from `.dashboard-wrapper`).
  - `getDockState()` — the Task 3 instance (Task 13's Reset Essentials calls `.reset()`).

- [ ] **Step 1: Update the contracts first (they fail until the DOM lands)**

In `tests/ui-layout.test.mjs`:

(a) In `'workspace exposes the approved Photoshop-style regions'`, replace the class list with:

```js
  for (const className of [
    'appbar',
    'editor-shell',
    'canvas-workspace',
    'right-dock',
    'dock-stack',
    'statusbar'
  ]) {
```

(b) Replace the whole test `'layers and history share the lower right dock'` with:

```js
test('the right dock is three tabbed stacks with grayed future tabs', () => {
  assert.equal((html.match(/class=["'][^"']*\bdock-stack\b[^"']*["']/g) ?? []).length, 3);
  for (const id of ['panel-layers', 'panel-history']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  const dock = readFileSync(resolve(root, 'src/shell/dock.ts'), 'utf8');
  for (const stub of ['Adjustments', 'Channels', 'Paths']) {
    assert.match(dock, new RegExp(`['"]${stub}['"]`), `dock must declare the ${stub} stub tab`);
  }
  assert.match(dock, /isTypingTarget/);
  assert.match(dock, /F6|F7/);
});
```

(c) In `'feature-owned ids remain available after the layout move'`, remove `'rail-layers', 'rail-props'` from the id list **only if this task also removes them — it does not; leave them until Task 8.** Remove nothing here; instead ADD `'panel-layers', 'panel-history'` to the list.

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:ui` — Expected: FAIL (no `.dock-stack`, no `src/shell/dock.ts`).

- [ ] **Step 3: Rewrite the right-dock markup in `index.html`**

Replace the entire `<div class="right-dock">…</div>` block (both `<aside>` panels) with:

```html
      <div class="right-dock">
        <aside class="panel glass-surface dock-stack" data-stack="1" hidden>
          <div class="dock-tabs" data-tabs="1" role="tablist"></div>
          <div class="dock-body" data-body="1">
            <div id="panel-color" hidden></div>
            <div id="panel-swatches" hidden></div>
          </div>
        </aside>

        <aside class="panel glass-surface dock-stack" data-stack="2">
          <div class="dock-tabs" data-tabs="2" role="tablist"></div>
          <div class="dock-body" data-body="2">
            <div id="tab-properties">
              <!-- UNCHANGED: keep the existing #prop-layer-name, #no-active-warning, and
                   #properties-editor-container subtree from the current file verbatim. -->
            </div>
          </div>
        </aside>

        <aside class="panel glass-surface dock-stack" data-stack="3">
          <div class="dock-tabs" data-tabs="3" role="tablist"></div>
          <div class="dock-body" data-body="3">
            <div id="panel-layers">
              <!-- UNCHANGED: move the current #tab-layers CONTENT here verbatim:
                   .layer-creation-buttons (#btn-add-image, #btn-add-text),
                   #upload-zone (+ #file-input), #layers-list-container. -->
            </div>
            <div id="panel-history" hidden>
              <div class="history-list" id="history-list"></div>
            </div>
          </div>
        </aside>
      </div>
```

The comments mark subtrees copied verbatim from the current file — do not retype them, cut-and-paste the existing nodes. `#layers-history-tabs`, `#tab-layers`, and `#tab-history` disappear (the framework's tab strips replace them).

- [ ] **Step 4: Implement `src/shell/dock.ts`**

```ts
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
      const activeId = state.activePanel(stack);
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
```

- [ ] **Step 5: Trim `src/history-panel.ts` and wire `src/main.ts`**

In `src/history-panel.ts`, delete the tab-switching block (the `const tabs = $('layers-history-tabs')` lookup, `layersPanel`/`historyPanel` lookups, and the `tabs.querySelectorAll…forEach` listener block) — `initHistoryPanel` keeps only `const list = $('history-list')` plus the `render` logic. In `src/main.ts`, add `import { initDock } from './shell/dock';` and call `initDock();` immediately after `initHistoryUI();`.

- [ ] **Step 6: CSS**

In `src/style.css`, replace the `.right-dock` grid block (the `grid-template-rows: minmax(220px, 1.08fr) minmax(210px, 0.92fr)` rule) and `.dock-heading`/`.panel-tabs` rules with:

```css
.right-dock {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
}

.dock-stack {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 0;
}

.dock-stack[data-stack="1"],
.dock-stack.collapsed {
  flex: 0 0 auto;
}

.dock-stack.collapsed .dock-body {
  display: none;
}

.dock-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px 0;
}

.dock-tab {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--mut);
  background: transparent;
  border: 0;
  border-radius: 5px 5px 0 0;
  cursor: pointer;
}

.dock-tab.active {
  color: var(--txt);
  background: var(--glass-soft);
}

.dock-tab:disabled {
  opacity: 0.38;
  cursor: default;
}

.dock-collapse {
  margin-left: auto;
  background: transparent;
  border: 0;
  color: var(--mut);
  cursor: pointer;
}

.dock-body {
  min-height: 0;
  overflow-y: auto;
  padding: 8px 10px;
}
```

Search `style.css` for selectors referencing `.properties-dock`, `.layers-history-dock`, `.panel-tabs`, `#tab-history`, `.dock-heading`, `.dock-title`, `.dock-kicker` and delete or retarget each to the new classes (the properties/layers CONTENT rules keep working — only dock-frame rules change). The `.hide-right` rule keeps targeting `.right-dock`.

- [ ] **Step 7: Gates**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS. (`'desktop dock responds to the existing panel visibility states'` asserts `.hide-left`/`.hide-right` CSS — unchanged, must still pass. If any old contract references `.properties-dock`/`.layers-history-dock`, update it to `.dock-stack` in this step.)

- [ ] **Step 8: Live verify**

On `http://localhost:3000/?audit-raf` (1280×800): stack 1 hidden (no panels yet); stack 2 shows the Properties tab + grayed Adjustments; stack 3 shows Layers/History live tabs + grayed Channels/Paths; clicking History swaps the body; collapse chevron collapses stack 3 to its strip; `F7` re-expands and activates Layers; layer selection/rename/properties editing still work end-to-end (make an edit, undo). Run the audit probe: zero surface violations, zero options occlusions.

- [ ] **Step 9: Commit**

```bash
git add index.html src/shell/dock.ts src/history-panel.ts src/main.ts src/style.css tests/ui-layout.test.mjs
git commit -m "feat: rebuild the right dock as three tabbed panel stacks"
git push origin main
```

---

### Task 5: Menu bar — component, File & Edit menus, shortcut dispatcher

**Files:**
- Create: `src/shell/menu-bar.ts`
- Modify: `index.html:13-34` (appbar → menu bar), `src/main.ts` (register Edit commands + extract `startFreeTransform`), `src/style.css` (menu rules), `tests/ui-layout.test.mjs`
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `registerCommand`, `getCommand`, `isCommandEnabled`, `runCommand`, `CommandDef` (Task 1); `isTypingTarget`, `isTransformSessionGuardOpen` (guard).
- Produces (used by Tasks 6, 7, 13):
  - `initMenuBar(): void` — renders the eleven headings into `#menu-root` from the `MENUS` structure; legacy-id items; global shortcut dispatcher for `bindKey` commands.
  - `MENUS: Array<{ title: string; items: Array<string | '—'> }>` exported for contract tests; `'—'` renders a separator.
  - Menu items re-evaluate `isCommandEnabled`/`checked` every time a menu opens.

- [ ] **Step 1: Update contracts first**

In `tests/ui-layout.test.mjs` add:

```js
test('the menu bar exposes all eleven Photoshop headings', () => {
  const menu = readFileSync(resolve(root, 'src/shell/menu-bar.ts'), 'utf8');
  for (const title of ['File', 'Edit', 'Image', 'Layer', 'Type', 'Select', 'Filter', 'View', 'Plugins', 'Window', 'Help']) {
    assert.match(menu, new RegExp(`title:\\s*['"]${title}['"]`), `missing ${title} menu`);
  }
  assert.match(html, /id=["']menu-root["']/);
  assert.match(menu, /isTypingTarget/);
});
```

Also in `'history navigation is blocked while any editing session is live'`: DELETE the two lines asserting `subscribeTransformSession(refresh)` and `subscribeCropSession(refresh)` — this task removes `refresh` (menu items now derive their disabled state from the command's `enabled()` at open time, which reads `historySessionBlocked()` live).

The `'feature-owned ids'` test keeps `btn-open`, `btn-save`, `btn-undo`, `btn-redo`, `btn-export` — after this task those ids live on menu items rendered by `menu-bar.ts`, not in `index.html`. Change that test's id list handling: split the list into `htmlIds` (checked against `html` as today, minus the five button ids) and add:

```js
  const menuSrc = readFileSync(resolve(root, 'src/shell/menu-bar.ts'), 'utf8');
  const mainSrc = main;
  for (const legacy of ['btn-open', 'btn-save', 'btn-undo', 'btn-redo', 'btn-export']) {
    assert.match(menuSrc + mainSrc, new RegExp(`['"]${legacy}['"]`), `legacy id ${legacy} must be produced by the menu bar`);
  }
```

- [ ] **Step 2: Run to verify failure** — `npm run test:ui`, expected FAIL (no menu-bar.ts).

- [ ] **Step 3: Replace the appbar markup in `index.html`**

```html
  <header class="appbar menu-bar glass-surface">
    <span class="app-mark" aria-hidden="true">T</span>
    <nav class="menus" id="menu-root" aria-label="Application menu"></nav>
  </header>
```

(The old `.app-identity` block, `.app-actions` cluster, `#project-input`, and the Export button are removed from the HTML; `#project-input` moves into the markup rendered by `menu-bar.ts`? No — keep `<input type="file" id="project-input" accept=".json,application/json" hidden>` in `index.html` directly after the header, since `src/topbar.ts` looks it up at init.)

- [ ] **Step 4: Implement `src/shell/menu-bar.ts`**

```ts
import { $ } from '../dom';
import { getCommand, isCommandEnabled, runCommand, type CommandDef } from './commands';
import { isTypingTarget, isTransformSessionGuardOpen } from '../transform-session-guard';

export const MENUS: Array<{ title: string; items: Array<string | '—'> }> = [
  { title: 'File', items: ['file.new', 'file.open', 'file.place', '—', 'file.save', 'file.export'] },
  { title: 'Edit', items: ['edit.undo', 'edit.redo', '—', 'edit.freeTransform'] },
  { title: 'Image', items: ['image.canvasSize', 'image.imageSize', 'image.mode'] },
  { title: 'Layer', items: ['layer.newImage', 'layer.newText', '—', 'layer.duplicate', 'layer.delete', 'layer.group'] },
  { title: 'Type', items: ['type.rasterize', 'type.convertShape'] },
  { title: 'Select', items: ['select.all', 'select.deselect', 'select.inverse', 'select.subject'] },
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
    const enabled = item ? isCommandEnabled(item) : false;
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
    for (const menu of MENUS) {
      for (const item of menu.items) {
        if (item === '—') continue;
        const def = getCommand(item);
        if (!def?.bindKey || def.shortcut !== combo) continue;
        if (!isCommandEnabled(item)) return;
        e.preventDefault();
        if (def.run) runCommand(item);
        else if (def.legacyId) document.getElementById(def.legacyId)?.click();
        return;
      }
    }
  });
}
```

**Note:** legacy-id menu items only exist in the DOM while their dropdown is open. `src/topbar.ts`, `src/export.ts`, and `initHistoryUI` attach listeners to those ids at startup — that breaks. Fix in the same step: menu items for legacy commands do NOT rely on startup listeners; instead register the legacy commands with real `run` functions and delete the legacy lookups:

- In `src/main.ts` (before `initTopbar()`), register:

```ts
import { registerCommand } from './shell/commands';
import { initMenuBar } from './shell/menu-bar';
import { saveProject } from './engine/persistence';
import { exportComposition } from './export';

registerCommand({ id: 'file.new', label: 'New Document…', shortcut: 'Ctrl+N', phase: 'F' });
registerCommand({ id: 'file.open', label: 'Open…', shortcut: 'Ctrl+O', bindKey: true, legacyId: 'btn-open', run: () => guardTransformSession(() => ($('project-input') as unknown as HTMLInputElement).click()) });
registerCommand({ id: 'file.place', label: 'Place Embedded…', run: () => guardTransformSession(() => ($('file-input') as unknown as HTMLInputElement).click()) });
registerCommand({ id: 'file.save', label: 'Save Project', shortcut: 'Ctrl+S', bindKey: true, legacyId: 'btn-save', run: () => { void saveProject(); } });
registerCommand({ id: 'file.export', label: 'Export PNG…', legacyId: 'btn-export', run: () => exportComposition() });
registerCommand({ id: 'edit.undo', label: 'Undo', shortcut: 'Ctrl+Z', legacyId: 'btn-undo', enabled: () => history.canUndo() && !historySessionBlocked(), run: () => history.undo() });
registerCommand({ id: 'edit.redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', legacyId: 'btn-redo', enabled: () => history.canRedo() && !historySessionBlocked(), run: () => history.redo() });
registerCommand({ id: 'edit.freeTransform', label: 'Free Transform', shortcut: 'Ctrl+T', enabled: () => Boolean(state.doc.activeLayerId), run: () => startFreeTransform() });
```

- Extract the Ctrl+T body in `src/main.ts` into `function startFreeTransform(): void { … }` (same code; the keydown branch calls it too).
- In `src/topbar.ts`: DELETE the `openBtn`/`saveBtn` lookups and listeners (the commands above own them); keep `#project-input` change wiring and everything else.
- In `src/export.ts`: change `initExport` to a no-op removal — delete `initExport` and its `main.ts` call; the command calls `exportComposition()` directly.
- In `src/main.ts` `initHistoryUI`: DELETE the `undoBtn`/`redoBtn` lookups, innerHTML, disabled sync, and click listeners (menu items now render from command `enabled()`); KEEP the `refresh` subscriptions only if still needed elsewhere — they are not; delete `refresh` too. The keyboard Ctrl+Z/Y block stays.
- Call `initMenuBar()` in `main.ts` right after the command registrations (before `initTopbar()`).

- [ ] **Step 5: Menu CSS**

Append to `src/style.css`:

```css
.menu-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
}

.menus {
  display: flex;
  align-items: center;
}

.menu-heading {
  position: relative;
}

.menu-title {
  padding: 6px 9px;
  background: transparent;
  border: 0;
  color: var(--txt);
  font-size: 12px;
  border-radius: 5px;
  cursor: pointer;
}

.menu-heading.open .menu-title,
.menu-title:hover {
  background: var(--glass-soft);
}

.menu-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 220px;
  padding: 4px;
  border-radius: 7px;
  z-index: 40;
  display: flex;
  flex-direction: column;
}

.menu-item {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 5px 9px;
  background: transparent;
  border: 0;
  color: var(--txt);
  font-size: 12px;
  text-align: left;
  border-radius: 5px;
  cursor: pointer;
}

.menu-item:not(:disabled):hover {
  background: var(--glass-soft);
}

.menu-item:disabled {
  opacity: 0.38;
  cursor: default;
}

.menu-shortcut {
  color: var(--mut);
}

.menu-separator {
  height: 1px;
  margin: 3px 6px;
  background: var(--glass-line);
}
```

- [ ] **Step 6: Gates** — all four; expected PASS (the updated feature-id contract accepts menu-produced ids).

- [ ] **Step 7: Live verify**

On `?audit-raf`: File menu opens/closes (outside click + Escape); Open triggers the project-file input; Save downloads (allow ≥2.5 s for the deferred `toBlob`); Export downloads a PNG; Edit shows Undo grayed with empty history, enabled after an edit, and running it reverts the canvas (pixel check); Ctrl+S and Ctrl+O fire through the dispatcher; Ctrl+T from the menu starts Free Transform and Escape cancels it. Probe: zero violations.

- [ ] **Step 8: Commit**

```bash
git add index.html src/shell/menu-bar.ts src/main.ts src/topbar.ts src/export.ts src/style.css tests/ui-layout.test.mjs
git commit -m "feat: replace the appbar with the eleven-menu Photoshop menu bar"
git push origin main
```

---

### Task 6: Remaining menus — Image, Layer, View, Help commands and phase stubs

**Files:**
- Modify: `src/main.ts` (command registrations)
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: registry (Task 1), `MENUS` ids (Task 5), `zoomAt`/`resetView` (`src/canvas.ts`), `getSnapEnabled`/`setSnapEnabled` (`src/tools/move.ts`), `cmdDeleteLayer` + `history` (engine), `toast` (`src/toast.ts`).
- Produces: every `MENUS` id except `layer.duplicate` (Task 7) and `workspace.reset` (Task 13) resolves to a registered command or stub.

- [ ] **Step 1: Contract first**

Add to `tests/ui-layout.test.mjs`:

```js
test('menu commands cover working actions and phase-labeled stubs', () => {
  for (const pair of [
    ["'image.canvasSize'", null], ["'layer.newImage'", null], ["'layer.newText'", null],
    ["'layer.delete'", null], ["'view.zoomIn'", null], ["'view.zoomOut'", null],
    ["'view.fit'", null], ["'view.snap'", null], ["'help.about'", null],
    ["'select.all'", "phase: 'C'"], ["'filter.gaussianBlur'", "phase: 'E'"],
    ["'type.rasterize'", "phase: 'D'"], ["'image.imageSize'", "phase: 'F'"]
  ]) {
    assert.match(main, new RegExp(pair[0].replaceAll('.', '\\.')), `missing registration ${pair[0]}`);
  }
  assert.match(main, /phase:\s*'C'/);
  assert.match(main, /phase:\s*'D'/);
  assert.match(main, /phase:\s*'E'/);
  assert.match(main, /phase:\s*'F'/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:ui`, expected FAIL.

- [ ] **Step 3: Register in `src/main.ts`** (next to the Task 5 registrations):

```ts
import { zoomAt, resetView } from './canvas';
import { getSnapEnabled, setSnapEnabled } from './tools/move';
import { cmdDeleteLayer } from './engine/commands';

registerCommand({ id: 'image.canvasSize', label: 'Canvas Size…', run: () => { $('size-menu').hidden = false; } });
registerCommand({ id: 'image.imageSize', label: 'Image Size…', phase: 'F' });
registerCommand({ id: 'image.mode', label: 'Mode', phase: 'E' });
registerCommand({ id: 'layer.newImage', label: 'New Image Layer', run: () => $('btn-add-image').click() });
registerCommand({ id: 'layer.newText', label: 'New Text Layer', run: () => $('btn-add-text').click() });
registerCommand({
  id: 'layer.delete', label: 'Delete Layer',
  enabled: () => Boolean(state.doc.activeLayerId),
  run: () => guardTransformSession(() => {
    const id = state.doc.activeLayerId;
    if (id) history.push(cmdDeleteLayer(id, 'Delete layer'));
  })
});
registerCommand({ id: 'layer.group', label: 'Group Layers', shortcut: 'Ctrl+G', phase: 'E' });
registerCommand({ id: 'view.zoomIn', label: 'Zoom In', shortcut: 'Ctrl+=', bindKey: true, run: () => zoomAt(1.25) });
registerCommand({ id: 'view.zoomOut', label: 'Zoom Out', shortcut: 'Ctrl+-', bindKey: true, run: () => zoomAt(0.8) });
registerCommand({ id: 'view.fit', label: 'Fit on Screen', shortcut: 'Ctrl+0', bindKey: true, run: () => resetView() });
registerCommand({ id: 'view.snap', label: 'Snap To', checked: () => getSnapEnabled(), run: () => setSnapEnabled(!getSnapEnabled()) });
registerCommand({ id: 'type.rasterize', label: 'Rasterize Type', phase: 'D' });
registerCommand({ id: 'type.convertShape', label: 'Convert to Shape', phase: 'D' });
registerCommand({ id: 'select.all', label: 'Select All', shortcut: 'Ctrl+A', phase: 'C' });
registerCommand({ id: 'select.deselect', label: 'Deselect', shortcut: 'Ctrl+D', phase: 'C' });
registerCommand({ id: 'select.inverse', label: 'Inverse', shortcut: 'Shift+Ctrl+I', phase: 'C' });
registerCommand({ id: 'select.subject', label: 'Select Subject', phase: 'C' });
registerCommand({ id: 'filter.gallery', label: 'Filter Gallery…', phase: 'E' });
registerCommand({ id: 'filter.gaussianBlur', label: 'Gaussian Blur…', phase: 'E' });
registerCommand({ id: 'filter.liquify', label: 'Liquify…', shortcut: 'Shift+Ctrl+X', phase: 'E' });
registerCommand({ id: 'plugins.marketplace', label: 'Plugin Marketplace', phase: 'F' });
registerCommand({
  id: 'help.about', label: 'About / System Info',
  run: () => toast(`Transparency — ${state.doc.width}×${state.doc.height}, ${state.doc.layers.length} layers, v2 document`, { duration: 6000 })
});
```

- [ ] **Step 4: Gates** — all four; expected PASS.

- [ ] **Step 5: Live verify**

Image > Canvas Size opens the size menu; Layer > New Text Layer adds a layer; Layer > Delete removes it and undo restores; View > Zoom In/Fit change the readout (Ctrl+= / Ctrl+0 too); View > Snap To shows a ✓ that toggles; Type/Select/Filter/Plugins render fully grayed with phase tooltips; Help > About shows the toast.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts tests/ui-layout.test.mjs
git commit -m "feat: register Image, Layer, View, and Help commands plus phase stubs"
git push origin main
```

---

### Task 7: Duplicate Layer (engine + Ctrl+J)

**Files:**
- Modify: `src/engine/document.ts` (add `cloneLayer`), `src/main.ts` (register `layer.duplicate`)
- Test: `tests/clone-layer.test.ts`

**Interfaces:**
- Consumes: `Layer`/`Doc` types, `defaultEffects` pattern; `cmdAddLayer` + `history.push` (existing).
- Produces: `cloneLayer(doc: Doc, layer: Layer): Layer` — fresh id, `name + ' copy'`, deep-copied `effects`, cloned bitmap canvas for image layers.

- [ ] **Step 1: Write the failing test**

Create `tests/clone-layer.test.ts` (same bootstrap idiom as `tests/audit-fixes.test.ts`):

```ts
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        font: '',
        measureText: (text: string) => ({ width: text.length * 10 }),
        drawImage: () => {}
      })
    })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
});

let doc: import('../src/engine/document').Doc;

beforeEach(() => {
  doc = documentModel.createDoc(800, 600);
});

test('cloning a text layer copies fields with a fresh id and copy name', () => {
  const layer = documentModel.createTextLayer(doc);
  layer.text = 'Hello';
  layer.effects.blurOn = true;
  const clone = documentModel.cloneLayer(doc, layer);
  expect(clone.id).not.toBe(layer.id);
  expect(clone.name).toBe(`${layer.name} copy`);
  expect(clone.kind).toBe('text');
  expect((clone as import('../src/engine/document').TextLayer).text).toBe('Hello');
  expect(clone.effects).not.toBe(layer.effects);
  expect(clone.effects.blurOn).toBe(true);
  clone.effects.blurOn = false;
  expect(layer.effects.blurOn).toBe(true);
});

test('cloning an image layer clones the bitmap canvas', () => {
  const layer = documentModel.createImageLayer(doc);
  layer.bitmap = document.createElement('canvas') as unknown as HTMLCanvasElement;
  (layer.bitmap as { width: number }).width = 32;
  (layer.bitmap as { height: number }).height = 16;
  const clone = documentModel.cloneLayer(doc, layer) as import('../src/engine/document').ImageLayer;
  expect(clone.bitmap).not.toBe(layer.bitmap);
  expect(clone.bitmap?.width).toBe(32);
  expect(clone.bitmap?.height).toBe(16);
  expect(clone.bitmapRev).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/clone-layer.test.ts`, expected FAIL (`cloneLayer` not exported).

- [ ] **Step 3: Implement `cloneLayer` in `src/engine/document.ts`** (after `createTextLayer`):

```ts
export function cloneLayer(doc: Doc, layer: Layer): Layer {
  const base = baseLayer(doc, `${layer.name} copy`);
  const common = {
    ...layer,
    id: base.id,
    name: base.name,
    effects: { ...layer.effects }
  };
  if (layer.kind === 'image') {
    let bitmap: HTMLCanvasElement | null = null;
    if (layer.bitmap) {
      bitmap = document.createElement('canvas');
      bitmap.width = layer.bitmap.width;
      bitmap.height = layer.bitmap.height;
      bitmap.getContext('2d')!.drawImage(layer.bitmap, 0, 0);
    }
    return { ...common, kind: 'image', bitmap, bitmapRev: 0 } as ImageLayer;
  }
  return { ...common, kind: 'text' } as TextLayer;
}
```

- [ ] **Step 4: Register the command in `src/main.ts`:**

```ts
import { cloneLayer } from './engine/document';
import { cmdAddLayer } from './engine/commands';

registerCommand({
  id: 'layer.duplicate', label: 'Duplicate Layer', shortcut: 'Ctrl+J', bindKey: true,
  enabled: () => Boolean(state.doc.activeLayerId),
  run: () => guardTransformSession(() => {
    const layer = state.doc.layers.find((l) => l.id === state.doc.activeLayerId);
    if (!layer) return;
    const index = state.doc.layers.indexOf(layer);
    history.push(cmdAddLayer(cloneLayer(state.doc, layer), index, 'Duplicate layer'));
  })
});
```

(Check `cmdAddLayer(layer, index, label)`'s exact signature in `src/engine/commands.ts` before writing — the layers panel calls `cmdAddLayer(layer, 0, 'Add image layer')`; use the same insertion contract, index = position of the source so the copy lands directly above it.)

- [ ] **Step 5: Run test + gates** — clone test PASS; all four gates PASS.

- [ ] **Step 6: Live verify** — select the text layer, press Ctrl+J: a "… copy" layer appears above it, becomes undoable as one entry; Layer > Duplicate Layer does the same.

- [ ] **Step 7: Commit**

```bash
git add src/engine/document.ts src/main.ts tests/clone-layer.test.ts
git commit -m "feat: add layer duplication with Ctrl+J"
git push origin main
```

---

### Task 8: Toolbar — grouped tools, flyouts, column toggle

**Files:**
- Create: `src/shell/toolbar.ts`, `src/shell/toolbar-groups.ts`
- Delete: `src/rail.ts`
- Modify: `index.html:71-79` (rail markup), `src/main.ts` (initRail → initToolbar), `src/style.css`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `allTools`, `setActiveTool`, `getActiveTool`, `onToolChange` (`src/engine/tools.ts`); `guardTransformSession`; `icons` (`src/dom.ts`).
- Produces (used by Tasks 9, 13):
  - `initToolbar(): void`; `setToolbarColumns(double: boolean): void`; `isToolbarDouble(): boolean`.
  - `TOOL_GROUPS` in `toolbar-groups.ts`: `Array<{ id: string; entries: Array<{ tool: string } | { stub: string; key: string; phase: 'B' | 'C' | 'D' | 'E' | 'F' }> }>`.

- [ ] **Step 1: Contracts first**

In `tests/ui-layout.test.mjs`:
(a) `'feature-owned ids'`: remove `rail-add-image`, `rail-add-text`, `rail-layers`, `rail-props` from the html id list (keep `rail-tools`).
(b) `'one spatial-glass guard owns unresolved explicit-session exits'`: the loop reads `rail` — change `const rail = readFileSync(resolve(root, 'src/rail.ts'), 'utf8')` to read `src/shell/toolbar.ts` (keep the variable name).
(c) Add:

```js
test('the toolbar renders the manual tool groups with grayed future slots', () => {
  const groups = readFileSync(resolve(root, 'src/shell/toolbar-groups.ts'), 'utf8');
  for (const stub of ['Rectangular Marquee', 'Lasso', 'Eyedropper', 'Brush', 'Pen', 'Horizontal Type', 'Rotate View']) {
    assert.match(groups, new RegExp(stub), `missing stub ${stub}`);
  }
  for (const live of ["tool: 'move'", "tool: 'crop'", "tool: 'hand'", "tool: 'zoom'"]) {
    assert.match(groups, new RegExp(live.replaceAll("'", "['\"]")), `missing live ${live}`);
  }
  const toolbar = readFileSync(resolve(root, 'src/shell/toolbar.ts'), 'utf8');
  assert.match(toolbar, /guardTransformSession/);
  assert.match(toolbar, /contextmenu/);
  assert.match(html, /id=["']toolbar-columns["']/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:ui`, expected FAIL.

- [ ] **Step 3: Markup** — replace the `<nav class="rail …">` block in `index.html` with:

```html
      <nav class="rail toolbar glass-surface" aria-label="Toolbar">
        <button class="rail-btn" id="toolbar-columns" title="Toggle single/double column" aria-label="Toggle toolbar columns">⋮⋮</button>
        <div class="rail-divider"></div>
        <div class="rail-tools" id="rail-tools"></div>
        <div class="rail-spacer"></div>
        <div id="color-chips"></div>
      </nav>
```

(`#color-chips` stays empty until Task 9.)

- [ ] **Step 4: Implement**

`src/shell/toolbar-groups.ts`:

```ts
export interface ToolEntry { tool: string }
export interface StubEntry { stub: string; key: string; phase: 'B' | 'C' | 'D' | 'E' | 'F' }
export type GroupEntry = ToolEntry | StubEntry;

export const TOOL_GROUPS: Array<{ id: string; entries: GroupEntry[] }> = [
  { id: 'move-select', entries: [{ tool: 'move' }, { stub: 'Rectangular Marquee', key: 'M', phase: 'C' }, { stub: 'Lasso', key: 'L', phase: 'C' }, { stub: 'Object Selection', key: 'W', phase: 'C' }] },
  { id: 'crop-slice', entries: [{ tool: 'crop' }, { stub: 'Frame Tool', key: 'K', phase: 'F' }] },
  { id: 'measure', entries: [{ stub: 'Eyedropper', key: 'I', phase: 'B' }] },
  { id: 'retouch', entries: [{ stub: 'Spot Healing Brush', key: 'J', phase: 'B' }, { stub: 'Clone Stamp', key: 'S', phase: 'B' }] },
  { id: 'paint', entries: [{ stub: 'Brush', key: 'B', phase: 'B' }, { stub: 'Eraser', key: 'E', phase: 'B' }] },
  { id: 'draw', entries: [{ stub: 'Pen', key: 'P', phase: 'D' }, { stub: 'Rectangle', key: 'U', phase: 'D' }] },
  { id: 'type', entries: [{ stub: 'Horizontal Type', key: 'T', phase: 'D' }] },
  { id: 'nav', entries: [{ tool: 'hand' }, { tool: 'zoom' }, { stub: 'Rotate View', key: 'R', phase: 'D' }] }
];
```

`src/shell/toolbar.ts`:

```ts
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
```

Delete `src/rail.ts`. In `src/main.ts`: replace `import { initRail } from './rail'` + `initRail()` with `import { initToolbar } from './shell/toolbar'` + `initToolbar()`. The old rail-layers/rail-props dock toggles are gone — dock visibility now comes from Window-menu focus commands (Task 4) and Tab toggles (Task 13).

- [ ] **Step 5: CSS** — append:

```css
.tool-slot { position: relative; }

.tool-group-btn.has-siblings::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  border-left: 4px solid transparent;
  border-bottom: 4px solid currentColor;
  opacity: 0.6;
}

.tool-flyout {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 6px;
  min-width: 190px;
  padding: 4px;
  border-radius: 7px;
  z-index: 30;
  display: flex;
  flex-direction: column;
}

.tool-flyout-item {
  padding: 5px 9px;
  text-align: left;
  background: transparent;
  border: 0;
  color: var(--txt);
  font-size: 12px;
  border-radius: 5px;
  cursor: pointer;
}

.tool-flyout-item:not(:disabled):hover { background: var(--glass-soft); }
.tool-flyout-item:disabled { opacity: 0.38; cursor: default; }

.toolbar.double .rail-tools {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
```

- [ ] **Step 6: Gates** — all four PASS (rail source contract now reads toolbar.ts).

- [ ] **Step 7: Live verify** — the eight groups render (four live icons, four grayed letters); right-click on the Move slot opens the flyout with grayed Marquee/Lasso; right-click Nav flyout switches Hand→Zoom; V/H/Z/C still work; the column toggle doubles the grid; during Free Transform a tool click summons the session guard (Apply/Cancel still resolves).

- [ ] **Step 8: Commit**

```bash
git add index.html src/shell/toolbar.ts src/shell/toolbar-groups.ts src/main.ts src/style.css tests/ui-layout.test.mjs
git rm src/rail.ts
git commit -m "feat: replace the rail with the grouped Photoshop toolbar"
git push origin main
```

---

### Task 9: Color chips — D/X, text-color and custom-background wiring

**Files:**
- Create: `src/shell/color-chips.ts`
- Modify: `src/main.ts` (init + D/X commands), `src/style.css`
- Test: `tests/color-chips.test.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: color-state (Task 2); `state`, `getActiveLayer` (`src/state.ts`); `history` + `cmdPatchLayer`, `cmdPatchDoc` (`src/engine/commands.ts`); registry (Task 1).
- Produces:
  - `wireColorApplication(): void` — headless subscription: foreground → active *text* layer color (coalesce key `${id}:color`); background → `doc.bgColor` when `bgType === 'custom'` (coalesce key `doc:bgColor`). No-ops when values already match (prevents loops).
  - `initColorChips(): void` — renders the overlapping chips + mini reset/swap buttons into `#color-chips`.

- [ ] **Step 1: Write the failing vitest**

Create `tests/color-chips.test.ts` (audit-fixes bootstrap idiom):

```ts
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('../src/canvas', () => ({ getOverlayScale: () => 1 }));

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let colorState: typeof import('../src/engine/color-state');
let chips: typeof import('../src/shell/color-chips');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} })
    })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  colorState = await import('../src/engine/color-state');
  chips = await import('../src/shell/color-chips');
  chips.wireColorApplication();
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(800, 600);
  history.clear();
  colorState.resetColors();
});

test('foreground edits recolor the active text layer as one coalesced command', () => {
  const layer = documentModel.createTextLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  colorState.setForeground('#ff0000');
  colorState.setForeground('#00ff00');
  expect(layer.color).toBe('#00ff00');
  expect(history.entries().length).toBe(1);
});

test('foreground edits ignore image layers and empty selections', () => {
  const layer = documentModel.createImageLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  colorState.setForeground('#123456');
  expect(history.entries().length).toBe(0);
});

test('background edits patch the doc only in custom background mode', () => {
  colorState.setBackground('#222222');
  expect(stateModule.state.doc.bgColor).toBe('#ffffff');
  stateModule.state.doc.bgType = 'custom';
  colorState.setBackground('#333333');
  expect(stateModule.state.doc.bgColor).toBe('#333333');
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/color-chips.test.ts`, expected FAIL.

- [ ] **Step 3: Implement `src/shell/color-chips.ts`**

```ts
import { $ } from '../dom';
import { state, getActiveLayer } from '../state';
import * as history from '../engine/history';
import { cmdPatchDoc, cmdPatchLayer } from '../engine/commands';
import {
  getBackground, getForeground, resetColors, setBackground, setForeground,
  subscribeColors, swapColors
} from '../engine/color-state';

export function wireColorApplication(): void {
  subscribeColors(() => {
    const fg = getForeground();
    const layer = getActiveLayer();
    if (layer && layer.kind === 'text' && layer.color !== fg) {
      history.push(cmdPatchLayer(layer.id, 'Text color', { color: fg }, `${layer.id}:color`));
    }
    const bg = getBackground();
    if (state.doc.bgType === 'custom' && state.doc.bgColor !== bg) {
      history.push(cmdPatchDoc('Background color', { bgColor: bg }, 'doc:bgColor'));
    }
  });
}

export function initColorChips(): void {
  const host = $('color-chips');
  host.innerHTML = `
    <div class="chip-pair" title="Foreground / Background (X swaps, D resets)">
      <input type="color" class="chip chip-fg" id="chip-foreground" aria-label="Foreground color">
      <input type="color" class="chip chip-bg" id="chip-background" aria-label="Background color">
    </div>
    <button type="button" class="chip-mini" id="chip-reset" title="Default colors (D)">▪</button>
    <button type="button" class="chip-mini" id="chip-swap" title="Swap colors (X)">⇄</button>`;
  const fgInput = $('chip-foreground') as unknown as HTMLInputElement;
  const bgInput = $('chip-background') as unknown as HTMLInputElement;
  const sync = () => { fgInput.value = getForeground(); bgInput.value = getBackground(); };
  fgInput.addEventListener('input', () => setForeground(fgInput.value));
  bgInput.addEventListener('input', () => setBackground(bgInput.value));
  $('chip-reset').addEventListener('click', () => resetColors());
  $('chip-swap').addEventListener('click', () => swapColors());
  subscribeColors(sync);
  sync();
}
```

In `src/main.ts`: `import { initColorChips, wireColorApplication } from './shell/color-chips';` — call `wireColorApplication()` with the command registrations and `initColorChips()` after `initToolbar()`; register:

```ts
import { resetColors, swapColors } from './engine/color-state';

registerCommand({ id: 'color.reset', label: 'Default Colors', shortcut: 'D', bindKey: true, run: () => resetColors() });
registerCommand({ id: 'color.swap', label: 'Swap Colors', shortcut: 'X', bindKey: true, run: () => swapColors() });
```

CSS append:

```css
#color-chips { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 0; }
.chip-pair { position: relative; width: 30px; height: 30px; }
.chip { position: absolute; width: 20px; height: 20px; padding: 0; border: 1px solid var(--glass-line); border-radius: 4px; cursor: pointer; }
.chip-fg { top: 0; left: 0; z-index: 2; }
.chip-bg { bottom: 0; right: 0; }
.chip-mini { background: transparent; border: 0; color: var(--mut); cursor: pointer; font-size: 11px; }
```

Contract addition to `tests/ui-layout.test.mjs`:

```js
test('color chips are wired with D/X commands and text/background application', () => {
  const chipsSrc = readFileSync(resolve(root, 'src/shell/color-chips.ts'), 'utf8');
  assert.match(chipsSrc, /cmdPatchLayer[\s\S]{0,120}?:color/);
  assert.match(chipsSrc, /doc:bgColor/);
  assert.match(main, /['"]D['"]/);
  assert.match(main, /['"]X['"]/);
  assert.match(html, /id=["']color-chips["']/);
});
```

- [ ] **Step 4: Run tests + gates** — chip vitest PASS; all four gates PASS.

- [ ] **Step 5: Live verify** — with the text layer active, picking a foreground color recolors the canvas text (pixel check) with one history entry per gesture; `X` swaps chips; `D` resets; with Background=Custom, editing the bg chip recolors the viewport; `D`/`X` do nothing while typing in a field.

- [ ] **Step 6: Commit**

```bash
git add src/shell/color-chips.ts src/main.ts src/style.css tests/color-chips.test.ts tests/ui-layout.test.mjs
git commit -m "feat: add foreground/background color chips with D and X shortcuts"
git push origin main
```

---

### Task 10: Color and Swatches panels (dock stack 1)

**Files:**
- Create: `src/panels/color-panel.ts`, `src/panels/swatches-panel.ts`
- Modify: `src/main.ts` (init + register panels), `src/style.css`
- Test: `tests/swatches-store.test.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: color-state (Task 2); `registerDockPanel` (Task 4).
- Produces:
  - `initColorPanel(): void` — fills `#panel-color` with R/G/B sliders + hex field + preview chips; edits call `setForeground`.
  - `initSwatchesPanel(): void` — fills `#panel-swatches`; `loadSwatches(): string[]` / `saveSwatches(list: string[]): void` exported for tests (`localStorage` key `transparency.swatches`; falls back to the 12 defaults when missing/corrupt).

- [ ] **Step 1: Write the failing vitest**

Create `tests/swatches-store.test.ts`:

```ts
import { beforeEach, expect, test, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); }
});

const { DEFAULT_SWATCHES, loadSwatches, saveSwatches } = await import('../src/panels/swatches-panel');

beforeEach(() => store.clear());

test('missing storage yields the twelve defaults', () => {
  expect(loadSwatches()).toEqual(DEFAULT_SWATCHES);
  expect(DEFAULT_SWATCHES).toHaveLength(12);
});

test('saved swatches round-trip', () => {
  saveSwatches(['#111111', '#222222']);
  expect(loadSwatches()).toEqual(['#111111', '#222222']);
});

test('corrupt storage falls back to defaults', () => {
  store.set('transparency.swatches', '{nope');
  expect(loadSwatches()).toEqual(DEFAULT_SWATCHES);
  store.set('transparency.swatches', JSON.stringify(['red', 5]));
  expect(loadSwatches()).toEqual(DEFAULT_SWATCHES);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/swatches-store.test.ts`, expected FAIL.

- [ ] **Step 3: Implement**

`src/panels/swatches-panel.ts`:

```ts
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
      cell.style.background = hex;
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
```

`src/panels/color-panel.ts`:

```ts
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
    ($('color-preview-fg')).style.background = fg;
    ($('color-preview-bg')).style.background = getBackground();
  };
  sliders.forEach((slider) => slider.addEventListener('input', () => {
    setForeground(toHex(Number(sliders[0].value), Number(sliders[1].value), Number(sliders[2].value)));
  }));
  hexInput.addEventListener('change', () => setForeground(hexInput.value));
  subscribeColors(sync);
  sync();
}
```

In `src/main.ts` after `initDock()`:

```ts
import { registerDockPanel } from './shell/dock';
import { initColorPanel } from './panels/color-panel';
import { initSwatchesPanel } from './panels/swatches-panel';

registerDockPanel({ id: 'color', title: 'Color', stack: 1, order: 1, fkey: 'F6' });
registerDockPanel({ id: 'swatches', title: 'Swatches', stack: 1, order: 2 });
initColorPanel();
initSwatchesPanel();
```

CSS append:

```css
.color-preview { display: flex; gap: 6px; margin-bottom: 8px; }
.color-preview-fg, .color-preview-bg { width: 22px; height: 22px; border-radius: 4px; border: 1px solid var(--glass-line); }
.color-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--mut); margin-bottom: 6px; }
.color-row input[type="range"] { flex: 1 1 auto; }
.color-value { width: 26px; text-align: right; font-variant-numeric: tabular-nums; }
.color-hex { width: 80px; }
.swatch-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; margin-bottom: 8px; }
.swatch { aspect-ratio: 1; border-radius: 4px; border: 1px solid var(--glass-line); cursor: pointer; }
```

Contract addition:

```js
test('stack one hosts working Color and Swatches panels', () => {
  const color = readFileSync(resolve(root, 'src/panels/color-panel.ts'), 'utf8');
  const swatches = readFileSync(resolve(root, 'src/panels/swatches-panel.ts'), 'utf8');
  assert.match(color, /setForeground/);
  assert.match(swatches, /transparency\.swatches/);
  assert.match(main, /registerDockPanel\(\{ id: 'color'/);
  assert.match(main, /F6/);
});
```

- [ ] **Step 4: Run tests + gates** — swatches vitest PASS; all four gates PASS.

- [ ] **Step 5: Live verify** — stack 1 now visible with Color/Swatches tabs; sliders move the foreground chip and (text layer active) the canvas text color; hex field round-trips; a saved swatch survives reload (`localStorage`); `F6` focuses the Color tab.

- [ ] **Step 6: Commit**

```bash
git add src/panels/color-panel.ts src/panels/swatches-panel.ts src/main.ts src/style.css tests/swatches-store.test.ts tests/ui-layout.test.mjs
git commit -m "feat: add Color and Swatches panels to the first dock stack"
git push origin main
```

---

### Task 11: Document tab and diagnostics status bar

**Files:**
- Create: `src/shell/status-bar.ts`
- Modify: `index.html` (document-tabs block + statusbar block), `src/canvas.ts` (add `setZoomPercent`), `src/main.ts` (init), `src/style.css`, `tests/ui-layout.test.mjs`
- Test: `tests/status-bar.test.ts`

**Interfaces:**
- Consumes: `subscribe` + `'view'`/`'canvasConfig'` flags (`src/state.ts`); `getZoomPercent`, new `setZoomPercent` (`src/canvas.ts`); `onToolChange`, `getActiveTool` (`src/engine/tools.ts`).
- Produces:
  - `parseZoomInput(text: string): number | null` — integer percent clamped 25–400, `null` for garbage (exported for tests).
  - `formatDocSizes(doc: Doc): string` — `"flat / layered"` MB estimate (flat = W×H×4; layered = flat + Σ image-bitmap W×H×4).
  - `initDocumentTab(): void`, `initStatusBar(): void`.
  - `src/canvas.ts` gains `export function setZoomPercent(p: number): void { setZoom(p / 100); }`.

- [ ] **Step 1: Write the failing vitest**

Create `tests/status-bar.test.ts`:

```ts
import { beforeAll, expect, test, vi } from 'vitest';

vi.mock('../src/canvas', () => ({ getZoomPercent: () => 100, setZoomPercent: () => {} }));

let statusBar: typeof import('../src/shell/status-bar');
let documentModel: typeof import('../src/engine/document');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} }) })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  statusBar = await import('../src/shell/status-bar');
  documentModel = await import('../src/engine/document');
});

test('zoom input parses and clamps like the engine', () => {
  expect(statusBar.parseZoomInput('250')).toBe(250);
  expect(statusBar.parseZoomInput(' 250% ')).toBe(250);
  expect(statusBar.parseZoomInput('7')).toBe(25);
  expect(statusBar.parseZoomInput('900')).toBe(400);
  expect(statusBar.parseZoomInput('abc')).toBeNull();
  expect(statusBar.parseZoomInput('')).toBeNull();
});

test('document sizes estimate flat and layered bytes', () => {
  const doc = documentModel.createDoc(1024, 1024);
  const layer = documentModel.createImageLayer(doc);
  layer.bitmap = { width: 512, height: 256 } as HTMLCanvasElement;
  doc.layers.push(layer);
  // flat = 1024*1024*4 = 4.0M; layered = flat + 512*256*4 = 4.5M
  expect(statusBar.formatDocSizes(doc)).toBe('4.0M / 4.5M');
});
```

- [ ] **Step 2: Run to verify failure** — expected FAIL, module missing.

- [ ] **Step 3: Implement**

Add to `src/canvas.ts` (next to `getZoomPercent`):

```ts
export function setZoomPercent(p: number): void { setZoom(p / 100); }
```

Create `src/shell/status-bar.ts`:

```ts
import { $ } from '../dom';
import { state, subscribe } from '../state';
import { getZoomPercent, setZoomPercent } from '../canvas';
import { getActiveTool, onToolChange } from '../engine/tools';
import type { Doc } from '../engine/document';

export function parseZoomInput(text: string): number | null {
  const match = text.trim().match(/^(\d+)\s*%?$/);
  if (!match) return null;
  return Math.max(25, Math.min(400, parseInt(match[1], 10)));
}

export function formatDocSizes(doc: Doc): string {
  const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  const flat = doc.width * doc.height * 4;
  let layered = flat;
  for (const layer of doc.layers) {
    if (layer.kind === 'image' && layer.bitmap) layered += layer.bitmap.width * layer.bitmap.height * 4;
  }
  return `${mb(flat)} / ${mb(layered)}`;
}

type Metric = 'dimensions' | 'sizes' | 'tool';
let metric: Metric = 'dimensions';

function metricText(): string {
  if (metric === 'sizes') return formatDocSizes(state.doc);
  if (metric === 'tool') return getActiveTool().label;
  return `${state.doc.width} × ${state.doc.height}`;
}

export function initDocumentTab(): void {
  const name = $('doc-tab-name');
  const zoom = $('doc-tab-zoom');
  const sync = () => { zoom.textContent = `${getZoomPercent()}%`; };
  name.textContent = 'Untitled composition';
  subscribe((dirty) => { if (dirty.has('view')) sync(); });
  sync();
}

export function initStatusBar(): void {
  const field = $('status-zoom-field') as unknown as HTMLInputElement;
  const display = $('status-doc-size');
  const selector = $('status-metric');
  const syncZoom = () => { if (document.activeElement !== field) field.value = `${getZoomPercent()}%`; };
  const syncMetric = () => { display.textContent = metricText(); };
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const value = parseZoomInput(field.value);
      if (value !== null) setZoomPercent(value);
      field.blur();
    }
    if (e.key === 'Escape') { syncZoom(); field.blur(); }
  });
  field.addEventListener('blur', syncZoom);
  selector.addEventListener('click', () => {
    metric = metric === 'dimensions' ? 'sizes' : metric === 'sizes' ? 'tool' : 'dimensions';
    selector.title = `Metric: ${metric}`;
    syncMetric();
  });
  subscribe((dirty) => {
    if (dirty.has('view')) syncZoom();
    if (dirty.has('canvasConfig') || dirty.has('structure')) syncMetric();
  });
  onToolChange(syncMetric);
  syncZoom();
  syncMetric();
}
```

`index.html` — replace the `.document-tabs` block with:

```html
        <div class="document-tabs" aria-label="Open documents">
          <div class="document-tab active">
            <span class="document-dot" aria-hidden="true"></span>
            <span id="doc-tab-name">Untitled composition</span>
            <span class="doc-tab-meta" id="doc-tab-zoom">100%</span>
            <span class="doc-tab-meta">RGB</span>
          </div>
        </div>
```

and the statusbar block with:

```html
  <footer class="statusbar glass-surface">
    <span class="status-zoom"><input id="status-zoom-field" class="status-zoom-input" value="100%" aria-label="Zoom percentage"></span>
    <span class="statusbar-center" id="status-context">Move · Drag to transform · Shift constrains</span>
    <span class="status-metric-wrap"><span id="status-doc-size">1024 × 1024</span><button type="button" id="status-metric" title="Metric: dimensions">▸</button></span>
  </footer>
```

In `src/main.ts`: `import { initDocumentTab, initStatusBar } from './shell/status-bar';` and call both after `initOptionsBar()`. **Check `src/topbar.ts`:** `syncDimensions` writes `statusSize.textContent` (`#status-doc-size`) — delete that line and the `statusSize` lookup from `topbar.ts` (the status bar owns the readout now; the size chip + inputs sync stays).

CSS append:

```css
.status-zoom-input { width: 52px; background: var(--card); border: 1px solid var(--glass-line); border-radius: 4px; color: var(--txt); font-size: 11px; padding: 1px 5px; font-variant-numeric: tabular-nums; }
.status-metric-wrap { display: inline-flex; align-items: center; gap: 4px; }
#status-metric { background: transparent; border: 0; color: var(--mut); cursor: pointer; }
.doc-tab-meta { color: var(--mut); font-size: 10px; margin-left: 8px; }
```

Contract addition + updates in `tests/ui-layout.test.mjs`:

```js
test('the status bar has a typeable zoom field and a metric selector', () => {
  assert.match(html, /id=["']status-zoom-field["']/);
  assert.match(html, /id=["']status-metric["']/);
  assert.match(html, /id=["']doc-tab-zoom["']/);
  const statusSrc = readFileSync(resolve(root, 'src/shell/status-bar.ts'), 'utf8');
  assert.match(statusSrc, /parseZoomInput/);
  assert.match(statusSrc, /formatDocSizes/);
});
```

and in `'document size status and custom inputs stay synchronized with state'`, delete the line `assert.match(topbar, /statusSize\.textContent\s*=\s*dimensions/);` and add `const statusSrc2 = readFileSync(resolve(root, 'src/shell/status-bar.ts'), 'utf8'); assert.match(statusSrc2, /state\.doc\.width/);`.

- [ ] **Step 4: Run tests + gates** — status vitest PASS; all four gates PASS.

- [ ] **Step 5: Live verify** — typing `250` + Enter in the zoom field zooms (readouts sync everywhere: field, pill, doc tab, Zoom option); `7` clamps to 25%; the metric selector cycles Dimensions → Sizes (`4.0M / …`) → tool name; resizing the canvas updates dimensions.

- [ ] **Step 6: Commit**

```bash
git add index.html src/shell/status-bar.ts src/canvas.ts src/topbar.ts src/main.ts src/style.css tests/status-bar.test.ts tests/ui-layout.test.mjs
git commit -m "feat: add the document tab and diagnostics status bar"
git push origin main
```

---

### Task 12: Pasteboard right-click shade menu (droppable stretch)

**Files:**
- Modify: `src/shell/status-bar.ts`? No — Create: `src/shell/pasteboard.ts`; Modify: `src/main.ts`, `src/style.css`

**Interfaces:**
- Consumes: `#canvas-container` (the pasteboard area around `#canvas-viewport`).
- Produces: `initPasteboard(): void` — `contextmenu` on the container (only when the target is the container/zoom-wrap itself, so canvas right-clicks stay free for future phases) opens a small glass menu with four shades; picking one sets `--pasteboard-bg` on the container.

- [ ] **Step 1: Implement `src/shell/pasteboard.ts`**

```ts
import { $ } from '../dom';

const SHADES: Array<[string, string]> = [
  ['Default', ''],
  ['Dark', '#14181f'],
  ['Darker', '#0b0e13'],
  ['Light', '#3a4150']
];

export function initPasteboard(): void {
  const container = $('canvas-container');
  let menu: HTMLElement | null = null;
  const close = () => { menu?.remove(); menu = null; };
  container.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    if (target !== container && target.id !== 'zoom-wrap') return;
    e.preventDefault();
    close();
    menu = document.createElement('div');
    menu.className = 'pasteboard-menu glass-surface';
    for (const [label, color] of SHADES) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'menu-item';
      item.innerHTML = `<span>${label}</span>`;
      item.addEventListener('click', () => {
        container.style.background = color;
        close();
      });
      menu.appendChild(item);
    }
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    document.body.appendChild(menu);
  });
  document.addEventListener('click', close);
}
```

CSS: `.pasteboard-menu { position: fixed; z-index: 50; min-width: 140px; padding: 4px; border-radius: 7px; display: flex; flex-direction: column; }`

Wire `initPasteboard()` in `src/main.ts`. No contract (droppable feature); if it interferes with pointer routing in live verify, delete the task's changes and record "pasteboard menu dropped" in the commit for Task 14's notes.

- [ ] **Step 2: Gates + live verify** — right-click on empty pasteboard opens the menu and changes the shade; right-click ON the canvas does nothing special; left-click dismisses; tool gestures unaffected (drag a layer afterward).

- [ ] **Step 3: Commit**

```bash
git add src/shell/pasteboard.ts src/main.ts src/style.css
git commit -m "feat: add the pasteboard right-click shade menu"
git push origin main
```

---

### Task 13: Workspace behaviors — Tab toggles and Reset Essentials

**Files:**
- Create: `src/shell/workspace.ts`
- Modify: `src/main.ts` (init + registration), `src/style.css`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `getDockState`, `focusPanel` (Task 4); `setToolbarColumns` (Task 8); `registerCommand` (Task 1); `isTypingTarget`, `isTransformSessionGuardOpen` (guard).
- Produces:
  - `initWorkspace(): void` — binds Tab/Shift+Tab; registers `workspace.reset`.
  - Body classes: `.ws-hide-all` (Tab) hides `.toolbar`, `.options-bar`, `.right-dock`; `.ws-hide-right` (Shift+Tab) hides `.right-dock` only.
  - `resetWorkspace(): void` — clears both body classes, `getDockState().reset()`, `setToolbarColumns(false)`, removes `.hide-left`/`.hide-right` from `.dashboard-wrapper`.

- [ ] **Step 1: Contract first**

```js
test('workspace toggles and reset follow the manual', () => {
  const ws = readFileSync(resolve(root, 'src/shell/workspace.ts'), 'utf8');
  assert.match(ws, /isTypingTarget/);
  assert.match(ws, /Shift/);
  assert.match(ws, /workspace\.reset/);
  assert.match(css, /\.ws-hide-all/);
  assert.match(css, /\.ws-hide-right/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:ui`, expected FAIL.

- [ ] **Step 3: Implement `src/shell/workspace.ts`**

```ts
import { registerCommand } from './commands';
import { getDockState } from './dock';
import { setToolbarColumns } from './toolbar';
import { isTypingTarget, isTransformSessionGuardOpen } from '../transform-session-guard';

export function resetWorkspace(): void {
  document.body.classList.remove('ws-hide-all', 'ws-hide-right');
  document.querySelector('.dashboard-wrapper')?.classList.remove('hide-left', 'hide-right');
  getDockState().reset();
  setToolbarColumns(false);
}

export function initWorkspace(): void {
  registerCommand({ id: 'workspace.reset', label: 'Workspace: Reset Essentials', run: () => resetWorkspace() });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (isTypingTarget(document.activeElement) || isTransformSessionGuardOpen()) return;
    e.preventDefault();
    if (e.shiftKey) document.body.classList.toggle('ws-hide-right');
    else document.body.classList.toggle('ws-hide-all');
  });
}
```

CSS append:

```css
body.ws-hide-all .toolbar,
body.ws-hide-all .options-bar,
body.ws-hide-all .right-dock,
body.ws-hide-right .right-dock {
  display: none;
}
```

Wire `initWorkspace()` in `src/main.ts` after `initDock()`. **Note:** the plain-Tab `preventDefault` intentionally suppresses focus traversal outside typing contexts — this matches Photoshop; the guard dialog keeps its own Tab trap because the handler bails while the guard is open.

- [ ] **Step 4: Gates** — all four PASS.

- [ ] **Step 5: Live verify** — Tab hides toolbar/options/docks and restores them; Shift+Tab toggles only the right docks; Tab inside a text field types normally; collapse a stack + switch to History + double the toolbar, then Window > Workspace: Reset Essentials restores everything (stacks expanded, Layers/Properties/Color active, single column, panels visible); probe matrix at 1024/1280/1440 with panels hidden/shown: zero violations.

- [ ] **Step 6: Commit**

```bash
git add src/shell/workspace.ts src/main.ts src/style.css tests/ui-layout.test.mjs
git commit -m "feat: add Tab panel toggles and Reset Essentials"
git push origin main
```

---

### Task 14: Final regression, docs, and close-out

**Files:**
- Modify: `README.md`, `docs/design.md`, `docs/changelog.md`, `tests/documentation.test.mjs` (design-doc contract retargets), `docs/superpowers/audit/overlap-probe.js` (add `.menu-bar` note — the surface list already covers `.appbar`, which the menu bar retains)
- No source changes.

- [ ] **Step 1: Full live regression**

On `?audit-raf` at 1280×800 and 1024×800: run the probe (surfaces including `.appbar`, `.options-bar`, `.rail`, docks, statusbar) in default + collapsed + `ws-hide-right` + double-column states — zero surface violations, zero options-bar occlusions, zero clipped controls (properties-dock scroll class excluded). Exercise one flow per new surface: each menu's working commands, a flyout tool switch, Ctrl+J, D/X, a swatch click, F6/F7, typed zoom, metric cycle, Tab/Shift+Tab, Reset Essentials. Exercise three legacy flows end-to-end: full transform session with guard, crop apply/undo, save/open round-trip.

- [ ] **Step 2: Docs**

- `README.md`: add a "Workspace" description of the menu bar, dock stacks, and toolbar; extend Essential Shortcuts with `Ctrl+J`, `Ctrl+0`, `D`, `X`, `Tab`, `Shift+Tab`, `F6`, `F7`; keep every existing contract-asserted line (V/H/Z/C, Ctrl+T, Space, Ctrl+Z, Enter/Escape/Shift, roadmap with groups and masks).
- `docs/design.md`: update region names — "application bar" → "application menu bar", "tool rail" → "toolbar", describe the three dock stacks (keep the phrase "Layers / History" — the stack contains both). In `tests/documentation.test.mjs`, update the design-guide fact list: replace `'application bar'` with `'application menu bar'` and `'tool rail'` with `'toolbar'`.
- `docs/changelog.md`: add at the top:

```markdown
## 3.2.0 - 2026-07-17

### Added

- **Photoshop Essentials workspace shell**: eleven-menu application bar with grayed roadmap commands, grouped toolbar with nested-tool flyouts and foreground/background color chips (`D` resets, `X` swaps), three tabbed right-dock stacks (Color/Swatches, Properties, Layers/History) with collapse and `F6`/`F7` focus, layer duplication (`Ctrl+J`), a document tab with live zoom, a typeable status-bar zoom field with a diagnostics metric selector, `Tab`/`Shift+Tab` panel toggling, and Window > Workspace > Reset Essentials. (Plan: 2026-07-17-photoshop-workspace-shell.)
```

- [ ] **Step 3: Gates + commit + protocol**

Run all four gates — PASS. Then:

```bash
git add README.md docs/design.md docs/changelog.md tests/documentation.test.mjs docs/superpowers/audit/overlap-probe.js
git commit -m "docs: document the Photoshop workspace shell and record 3.2.0"
git push origin main
```

AGENTS.md protocol: hooks refresh the graph; new modules (`src/shell/*`, `src/panels/*`) change structure → `python -m graphify export obsidian`; verify `graphify-out/` stays untracked. Update the project memory with the shipped Phase A state and the B–F roadmap pointer.

