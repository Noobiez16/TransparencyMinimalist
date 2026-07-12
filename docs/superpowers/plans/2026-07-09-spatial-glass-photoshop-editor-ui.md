# Spatial Glass Photoshop-Style Editor UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the existing editor into an easy-to-scan Photoshop-style workspace and apply the approved balanced spatial-glass visual system without changing editor capabilities or document behavior.

**Architecture:** Preserve the existing DOM IDs and feature modules, but regroup the page into an application bar, contextual options bar, left tool rail, central canvas workspace, and a two-part right dock. Use CSS grid to place the current Layers and Properties panels in the right dock, make Layers/History a local tab set, and derive all collapsed layouts from the existing `hide-left` and `hide-right` classes. Add a dependency-free Node contract test that protects the DOM IDs, dock structure, glass tokens, fallback, and responsive breakpoint.

**Tech Stack:** HTML5, vanilla CSS, TypeScript 5, Vite 5, Node's built-in `node:test` runner.

## Global Constraints

- The desktop layout applies at viewport widths of 1024px and above.
- Below 1024px, keep the canvas first, make the tool rail horizontal, and stack Properties and Layers/History below the canvas.
- Preserve all existing control IDs consumed by TypeScript.
- Preserve all state fields, dirty flags, tool IDs, keyboard shortcuts, command labels, rendering, persistence, autosave, history, graph, and export behavior.
- Add no editing capabilities, new shortcuts, draggable docks, customizable workspaces, or decorative controls that look interactive but do nothing.
- Keep Inter and the current SVG icon infrastructure; do not introduce emoji-based application icons.
- Use balanced glass: readable dark tint, restrained blur, fine light borders, soft inner highlights, and quiet environmental color.
- Provide a solid high-opacity fallback when `backdrop-filter` is unavailable.
- Honor `prefers-reduced-motion: reduce`.
- Inspect the current working-tree version of each shared file immediately before editing so concurrent work is not overwritten.

---

## File Map

- Create `tests/ui-layout.test.mjs`: dependency-free structural and CSS contract tests for this redesign.
- Modify `package.json`: add the `test:ui` script only; add no dependency.
- Modify `index.html`: regroup existing controls into the approved workspace hierarchy while preserving functional IDs and existing property-control markup.
- Modify `src/history-panel.ts`: retarget History switching from Properties/History to Layers/History.
- Modify `src/style.css`: implement the glass tokens, desktop dock layout, component styling, panel-collapse states, responsive stacking, fallback, and reduced motion.
- Do not modify `src/rail.ts` unless verification proves the current `hide-left`/`hide-right` mapping no longer works. The planned CSS keeps that mapping intact.

---

### Task 1: Lock the UI contract and reorganize the workspace DOM

**Files:**
- Create: `tests/ui-layout.test.mjs`
- Modify: `package.json:6-10`
- Modify: `index.html:12-216`
- Modify: `src/history-panel.ts:4-17`

**Interfaces:**
- Consumes: existing DOM IDs referenced through `src/dom.ts` and the current `hide-left`/`hide-right` classes emitted by `src/rail.ts`.
- Produces: `.appbar`, `.editor-shell`, `.canvas-workspace`, `.right-dock`, `.properties-dock`, `.layers-history-dock`, `#layers-history-tabs`, `#tab-layers`, and the relocated `#tab-history` contract used by Task 2.

- [ ] **Step 1: Re-check shared files before editing**

Run:

```powershell
git status --short
git diff -- index.html src/style.css src/history-panel.ts src/rail.ts package.json
```

Expected: only known plan/spec changes; stop and reconcile if concurrent edits appear in a target file.

- [ ] **Step 2: Add the failing layout contract test**

Create `tests/ui-layout.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'src/style.css'), 'utf8');

function hasClass(source, className) {
  return new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`).test(source);
}

function ids(source) {
  return [...source.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
}

test('workspace exposes the approved Photoshop-style regions', () => {
  for (const className of [
    'appbar',
    'editor-shell',
    'canvas-workspace',
    'right-dock',
    'properties-dock',
    'layers-history-dock',
    'statusbar'
  ]) {
    assert.equal(hasClass(html, className), true, `missing .${className}`);
  }
});

test('layers and history share the lower right dock', () => {
  assert.match(html, /id=["']layers-history-tabs["']/);
  assert.match(html, /id=["']tab-layers["']/);
  assert.match(html, /id=["']tab-history["']/);
  assert.match(html, /data-tab=["']layers["']/);
  assert.match(html, /data-tab=["']history["']/);
});

test('all DOM ids remain unique', () => {
  const all = ids(html);
  const duplicates = [...new Set(all.filter((id, index) => all.indexOf(id) !== index))];
  assert.deepEqual(duplicates, []);
});

test('feature-owned ids remain available after the layout move', () => {
  for (const id of [
    'btn-open', 'btn-save', 'btn-undo', 'btn-redo', 'btn-export',
    'options-host', 'size-chip', 'canvas-width', 'canvas-height',
    'rail-tools', 'rail-add-image', 'rail-add-text', 'rail-graph',
    'rail-layers', 'rail-props', 'btn-add-image', 'btn-add-text',
    'upload-zone', 'file-input', 'layers-list-container',
    'canvas-container', 'canvas-viewport', 'doc-canvas',
    'zoom-out', 'zoom-readout', 'zoom-in', 'bg-color-picker',
    'tab-properties', 'properties-editor-container', 'history-list',
    'graph-overlay', 'graph-canvas'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

export { html, css };
```

Modify `package.json` scripts to:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test:ui": "node --test tests/ui-layout.test.mjs"
}
```

- [ ] **Step 3: Run the contract test and confirm the intended failure**

Run:

```powershell
npm run test:ui
```

Expected: FAIL with `missing .appbar`; the current DOM has not been reorganized yet.

- [ ] **Step 4: Reorganize `index.html` without changing feature-owned controls**

Replace the body-level editor shell with this structure. Move the existing Properties form contents unchanged into `#tab-properties`; move the existing layer buttons, drop zone, and `#layers-list-container` unchanged into `#tab-layers`.

```html
<body>
  <header class="appbar glass-surface">
    <div class="app-identity">
      <span class="app-mark" aria-hidden="true">T</span>
      <div>
        <div class="topbar-title">Transparency</div>
        <div class="app-subtitle">Layer image editor</div>
      </div>
    </div>
    <div class="app-actions" aria-label="Project actions">
      <div class="file-cluster">
        <button class="btn-icon" id="btn-open" title="Open project" aria-label="Open project"></button>
        <button class="btn-icon" id="btn-save" title="Save project" aria-label="Save project"></button>
      </div>
      <input type="file" id="project-input" accept=".json,application/json" hidden>
      <span class="action-divider" aria-hidden="true"></span>
      <div class="undo-cluster">
        <button class="btn-icon" id="btn-undo" title="Undo (Ctrl+Z)" aria-label="Undo"></button>
        <button class="btn-icon" id="btn-redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo"></button>
      </div>
    </div>
    <button class="btn btn-primary btn-export" id="btn-export">Export</button>
  </header>

  <div class="options-bar glass-surface">
    <div class="options-host" id="options-host">
      <span class="options-empty" id="options-empty">No options for this tool</span>
    </div>
    <div class="workspace-settings">
      <div class="canvas-controls" aria-label="Canvas background">
        <span class="control-label">Background</span>
        <div class="theme-toggles">
          <button class="btn btn-theme active" data-bg="transparent">Transparent</button>
          <button class="btn btn-theme" data-bg="white">White</button>
          <button class="btn btn-theme" data-bg="black">Black</button>
          <button class="btn btn-theme" data-bg="custom">Custom</button>
        </div>
        <input type="color" id="bg-color-picker" value="#ffffff" hidden>
      </div>
      <div class="size-chip-wrap">
        <button class="size-chip" id="size-chip">1024 × 1024 ▾</button>
        <!-- Preserve the existing #size-menu, preset buttons, custom inputs, and apply button here. -->
      </div>
    </div>
  </div>

  <div class="editor-shell">
    <div class="dashboard-wrapper">
      <nav class="rail glass-surface" aria-label="Toolbar">
        <!-- Preserve the existing rail controls and IDs in their current order. -->
      </nav>

      <main class="canvas-workspace center-panel">
        <div class="document-tabs" aria-label="Open documents">
          <div class="document-tab active">
            <span class="document-dot" aria-hidden="true"></span>
            <span>Untitled project</span>
          </div>
        </div>
        <div class="canvas-container" id="canvas-container">
          <div id="zoom-wrap">
            <div class="canvas-viewport checkerboard-bg" id="canvas-viewport">
              <canvas id="doc-canvas"></canvas>
            </div>
          </div>
        </div>
        <div class="zoom-pill glass-surface" aria-label="Canvas zoom">
          <button id="zoom-out" title="Zoom out">−</button>
          <button id="zoom-readout" title="Reset zoom">100%</button>
          <button id="zoom-in" title="Zoom in">+</button>
        </div>
      </main>

      <div class="right-dock">
        <aside class="panel glass-surface properties-dock right-panel">
          <div class="dock-heading">
            <div><span class="dock-title">Properties</span><span class="dock-kicker">Selected layer</span></div>
          </div>
          <div id="tab-properties">
            <!-- Preserve the complete existing Properties markup and all IDs here. -->
          </div>
        </aside>

        <aside class="panel glass-surface layers-history-dock left-panel">
          <div class="panel-tabs" id="layers-history-tabs" role="tablist" aria-label="Layer workspace">
            <button data-tab="layers" class="active" role="tab" aria-selected="true">Layers</button>
            <button data-tab="history" role="tab" aria-selected="false">History</button>
          </div>
          <div id="tab-layers">
            <!-- Preserve the layer creation buttons, #upload-zone, #file-input, and #layers-list-container here. -->
          </div>
          <div id="tab-history" hidden>
            <div class="history-list" id="history-list"></div>
          </div>
        </aside>
      </div>
    </div>
  </div>

  <footer class="statusbar glass-surface">
    <span>Professional canvas workspace</span>
    <span class="statusbar-center">Move · Hand · Zoom</span>
    <span>1024 × 1024</span>
  </footer>

  <!-- Preserve the complete existing graph overlay and module script after the editor shell. -->
</body>
```

The comments above are relocation instructions for existing complete blocks, not application copy; the implemented `index.html` must retain the full existing blocks and may keep concise structural comments only.

- [ ] **Step 5: Retarget History to Layers/History tabs**

Replace the tab setup at the start of `initHistoryPanel()` with:

```ts
export function initHistoryPanel(): void {
  const list = $('history-list');
  const tabs = $('layers-history-tabs');
  const layersPanel = $('tab-layers');
  const historyPanel = $('tab-history');

  tabs.querySelectorAll<HTMLButtonElement>('button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabs.querySelectorAll<HTMLButtonElement>('button[data-tab]').forEach((candidate) => {
        const selected = candidate === btn;
        candidate.classList.toggle('active', selected);
        candidate.setAttribute('aria-selected', String(selected));
      });
      layersPanel.hidden = tab !== 'layers';
      historyPanel.hidden = tab !== 'history';
    });
  });

  const render = () => {
    // Keep the existing history row rendering and history.jump() behavior unchanged.
  };

  history.onChange(render);
  render();
}
```

In the actual file, retain the current complete `render` body verbatim after the new tab setup.

- [ ] **Step 6: Run structural verification**

Run:

```powershell
npm run test:ui
npm run build
```

Expected: `test:ui` reports four passing tests; TypeScript and Vite build successfully. Styling may still look incomplete until Task 2.

- [ ] **Step 7: Commit the DOM contract and layout structure**

```powershell
git add package.json tests/ui-layout.test.mjs index.html src/history-panel.ts
git commit -m "feat: reorganize editor workspace"
```

---

### Task 2: Implement balanced spatial glass and dock behavior

**Files:**
- Modify: `tests/ui-layout.test.mjs`
- Modify: `src/style.css:1-373`

**Interfaces:**
- Consumes: the classes and IDs produced by Task 1 and the existing `hide-left`, `hide-right`, `.active`, `[hidden]`, `[aria-checked]`, `.dragging`, `.drop-above`, `.open`, and `.show` states.
- Produces: the complete desktop/right-dock layout, readable glass token system, component styling, collapse behavior, compact layout below 1024px, blur fallback, and reduced-motion behavior.

- [ ] **Step 1: Re-check target files for concurrent changes**

Run:

```powershell
git status --short
git diff -- src/style.css tests/ui-layout.test.mjs
```

Expected: no unreviewed concurrent edits in either target file.

- [ ] **Step 2: Extend the contract test for glass and responsive requirements**

Append these tests to `tests/ui-layout.test.mjs`:

```js
test('balanced spatial glass tokens are defined', () => {
  for (const token of [
    '--app-bg', '--glass', '--glass-strong', '--glass-soft',
    '--glass-line', '--glass-shine', '--txt', '--mut'
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`), `missing ${token}`);
  }
  assert.match(css, /backdrop-filter\s*:/);
});

test('desktop dock responds to the existing panel visibility states', () => {
  assert.match(css, /\.dashboard-wrapper\.hide-left/);
  assert.match(css, /\.dashboard-wrapper\.hide-right/);
  assert.match(css, /\.dashboard-wrapper\.hide-left\.hide-right/);
  assert.match(css, /\.right-dock/);
});

test('compact, fallback, and reduced-motion rules are present', () => {
  assert.match(css, /@media\s*\(max-width:\s*1023px\)/);
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*1024px\)/);
  assert.match(css, /@supports\s+not\s+\(backdrop-filter:/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
```

- [ ] **Step 3: Run the new tests and confirm the intended failure**

Run:

```powershell
npm run test:ui
```

Expected: the four Task 1 tests pass and the new glass contract fails first with `missing --app-bg`.

- [ ] **Step 4: Replace the root tokens and application geometry**

Start `src/style.css` with this foundation:

```css
:root {
  --app-bg: #080b12;
  --workspace: #111722;
  --glass: rgba(31, 38, 52, 0.68);
  --glass-strong: rgba(25, 30, 42, 0.88);
  --glass-soft: rgba(73, 85, 108, 0.34);
  --glass-line: rgba(232, 240, 255, 0.16);
  --glass-shine: rgba(255, 255, 255, 0.08);
  --card: rgba(9, 13, 22, 0.30);
  --card-hi: rgba(215, 229, 255, 0.13);
  --line: rgba(232, 240, 255, 0.12);
  --txt: #f0f4fb;
  --mut: #a7b0c0;
  --selection: #eef5ff;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
*:focus-visible { outline: 2px solid var(--selection); outline-offset: 2px; }
[hidden] { display: none !important; }

body {
  min-width: 320px;
  height: 100vh;
  overflow: hidden;
  display: grid;
  grid-template-rows: 44px 44px minmax(0, 1fr) 24px;
  gap: 7px;
  padding: 7px;
  color: var(--txt);
  background:
    radial-gradient(circle at 72% 12%, rgba(82, 105, 157, 0.28), transparent 28%),
    radial-gradient(circle at 18% 88%, rgba(98, 72, 132, 0.22), transparent 31%),
    var(--app-bg);
  font: 12px/1.4 Inter, system-ui, sans-serif;
}

.glass-surface {
  background: linear-gradient(145deg, rgba(70, 81, 105, 0.34), var(--glass));
  border: 1px solid var(--glass-line);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.32), inset 0 1px var(--glass-shine);
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
}

.appbar,
.options-bar,
.statusbar { border-radius: 9px; }

.editor-shell { min-height: 0; }

.dashboard-wrapper {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 300px;
  gap: 8px;
  transition: grid-template-columns 220ms var(--ease);
}

.rail { grid-column: 1; }
.canvas-workspace { grid-column: 2; }
.right-dock {
  grid-column: 3;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(220px, 1.08fr) minmax(210px, 0.92fr);
  gap: 8px;
}

.dashboard-wrapper.hide-left .left-panel,
.dashboard-wrapper.hide-right .right-panel {
  display: none;
}

.dashboard-wrapper.hide-left .right-dock,
.dashboard-wrapper.hide-right .right-dock { grid-template-rows: minmax(0, 1fr); }

.dashboard-wrapper.hide-left.hide-right {
  grid-template-columns: 44px minmax(0, 1fr);
}

.dashboard-wrapper.hide-left.hide-right .right-dock { display: none; }
```

- [ ] **Step 5: Style the professional workspace components**

Implement these exact relationships in `src/style.css` while retaining selectors required by existing modules:

```css
.appbar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
  align-items: center;
  padding: 0 10px;
}
.app-identity, .app-actions, .file-cluster, .undo-cluster { display: flex; align-items: center; }
.app-identity { gap: 8px; }
.app-mark { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 6px; color: #172033; background: linear-gradient(#fff, #cfdaea); font-weight: 600; }
.topbar-title { font-size: 12px; font-weight: 600; }
.app-subtitle { color: var(--mut); font-size: 9px; }
.app-actions { justify-self: center; gap: 6px; }
.file-cluster, .undo-cluster { gap: 4px; }
.action-divider { width: 1px; height: 18px; background: var(--line); }
.btn-export { justify-self: end; width: auto; margin: 0; padding: 7px 18px; }

.options-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 10px; min-width: 0; }
.options-host, .workspace-settings, .canvas-controls { display: flex; align-items: center; gap: 10px; }
.options-host { min-width: 0; }
.control-label, .opt-label { color: var(--mut); }

.rail { border-radius: 10px; padding: 7px 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.rail-tools { display: flex; flex-direction: column; gap: 4px; }
.rail-btn { width: 30px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 6px; color: var(--mut); background: transparent; cursor: pointer; }
.rail-btn:hover { color: var(--txt); background: var(--glass-soft); }
.rail-btn.active { color: #172033; background: linear-gradient(145deg, #fff, #cfdaea); box-shadow: 0 6px 14px rgba(0, 0, 0, 0.24), inset 0 1px #fff; }

.canvas-workspace { position: relative; min-width: 0; min-height: 0; overflow: hidden; border: 1px solid rgba(255,255,255,.08); border-radius: 10px; background: radial-gradient(circle at 50% 44%, rgba(66,78,103,.48), rgba(11,15,22,.78) 60%); }
.document-tabs { height: 30px; display: flex; background: rgba(8, 11, 18, 0.34); border-bottom: 1px solid var(--line); }
.document-tab { width: 190px; display: flex; align-items: center; gap: 8px; padding: 0 10px; color: var(--mut); border-right: 1px solid var(--line); }
.document-tab.active { color: var(--txt); background: rgba(91, 106, 137, 0.28); }
.document-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--selection); box-shadow: 0 0 8px rgba(220,232,255,.5); }
.canvas-container { position: absolute; inset: 30px 0 0; max-height: none; }
.canvas-viewport { border-radius: 2px; border: 1px solid rgba(255,255,255,.18); box-shadow: 0 28px 58px rgba(0,0,0,.65), 0 0 34px rgba(121,151,210,.10); }
.zoom-pill { position: absolute; right: 12px; bottom: 12px; z-index: 2; margin: 0; border-radius: 7px; }

.panel { min-width: 0; min-height: 0; overflow: auto; padding: 0; border-radius: 10px; }
.dock-heading, .panel-tabs { min-height: 34px; display: flex; align-items: center; border-bottom: 1px solid var(--line); background: rgba(8, 11, 18, 0.14); }
.dock-heading { padding: 0 11px; }
.dock-title { display: block; font-weight: 600; }
.dock-kicker { display: block; margin-top: 1px; color: var(--mut); font-size: 9px; }
#tab-properties, #tab-layers, #tab-history { padding: 10px; }
.panel-tabs button { align-self: stretch; padding: 0 12px; border: 0; border-right: 1px solid var(--line); color: var(--mut); background: transparent; cursor: pointer; }
.panel-tabs button.active { color: var(--txt); box-shadow: inset 0 -2px var(--selection); }
.layer-card.active { border-color: rgba(238,245,255,.72); background: linear-gradient(90deg, rgba(215,230,255,.16), rgba(255,255,255,.06)); box-shadow: inset 2px 0 var(--selection); }

.statusbar { display: flex; align-items: center; justify-content: space-between; padding: 0 10px; color: var(--mut); font-size: 9px; }
.statusbar-center { color: rgba(240,244,251,.72); }
```

Restyle the existing `.btn`, `.btn-icon`, `.seg`, `.theme-toggles`, `.size-chip`, `.size-menu`, `.switch`, `.fx-row`, `.upload-zone`, `.layer-card`, inputs, ranges, `.history-row`, `.toast`, and graph overlay using the same tokens. Preserve their current dimensions and state selectors unless the blocks above explicitly replace them. No element may use a color outside the token relationships except the canvas checkerboard and the existing graph node-category colors.

- [ ] **Step 6: Add compact, blur-fallback, and motion rules**

Append:

```css
@media (max-width: 1023px) {
  body { height: auto; min-height: 100vh; overflow-y: auto; grid-template-rows: auto auto auto auto; }
  .appbar { grid-template-columns: 1fr auto; row-gap: 6px; min-height: 48px; }
  .app-actions { justify-self: end; }
  .btn-export { grid-column: 2; }
  .options-bar, .workspace-settings, .canvas-controls { flex-wrap: wrap; }
  .dashboard-wrapper { display: flex; flex-direction: column; }
  .rail { flex-direction: row; justify-content: center; min-height: 44px; padding: 6px 10px; }
  .rail-tools { flex-direction: row; }
  .canvas-workspace { order: 1; min-height: 58vh; }
  .rail { order: 0; }
  .right-dock { order: 2; display: flex; flex-direction: column; }
  .panel { max-height: none; overflow: visible; }
  .dashboard-wrapper.hide-left .left-panel,
  .dashboard-wrapper.hide-right .right-panel { display: none; }
  .canvas-container { padding: 12px; }
  .statusbar-center { display: none; }
}

@media (max-width: 640px) {
  body { padding: 4px; gap: 4px; }
  .app-subtitle, .control-label { display: none; }
  .appbar { grid-template-columns: 1fr auto; }
  .app-actions { grid-row: 2; grid-column: 1 / -1; justify-self: stretch; justify-content: center; }
  .theme-toggles { width: 100%; overflow-x: auto; }
  .btn-theme { flex: 1; }
  .document-tab { width: 100%; }
}

@supports not (backdrop-filter: blur(1px)) {
  .glass-surface { background: var(--glass-strong); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

- [ ] **Step 7: Run automated checks**

Run:

```powershell
npm run test:ui
npm run build
```

Expected: seven UI contract tests pass; TypeScript and Vite build successfully.

- [ ] **Step 8: Commit the spatial-glass presentation**

```powershell
git add tests/ui-layout.test.mjs src/style.css
git commit -m "feat: apply spatial glass editor ui"
```

---

### Task 3: Browser verification and focused polish

**Files:**
- Modify only if verification finds a defect: `index.html`, `src/style.css`, `src/history-panel.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: the complete UI from Tasks 1 and 2.
- Produces: a visually verified responsive editor with all current actions reachable, readable glass fallback, correct focus behavior, and no console errors.

- [ ] **Step 1: Start the development server and open the editor**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

Expected: Vite reports a local URL and the editor loads without a runtime exception.

- [ ] **Step 2: Verify the desktop workspace at 1440×900 and 1024×768**

Check:

- app actions remain visible and functional;
- tool rail, canvas, Properties, and Layers/History occupy the approved regions;
- the canvas is the visual focus;
- glass text and controls remain readable against the environmental background;
- Layers and Properties toggles collapse their sections and expand the canvas;
- Layers/History tabs change only the lower dock;
- the graph overlay appears above all glass chrome;
- toasts are not hidden behind the status bar or docks.

Expected: no overlap, clipped controls, blocked scroll regions, or console errors.

- [ ] **Step 3: Verify the compact workspace at 900×900 and 390×844**

Check:

- canvas precedes inspector panels;
- tool rail becomes a horizontal strip;
- Properties and Layers/History stack below the canvas;
- application actions and contextual options wrap without overlap;
- every native input remains reachable by keyboard and pointer;
- panel contents scroll through the page rather than being clipped.

Expected: usable single-column editor with no horizontal page overflow.

- [ ] **Step 4: Verify current feature behavior**

Exercise Open, Save, Undo, Redo, Export, Move, Hand, Zoom, Space-to-pan, tool shortcuts, Add Image, Add Text, paste/drop/upload, selection, reorder, visibility, rename, delete, all property controls, effect toggles, Layers/History switching, history jumping, canvas presets, custom dimensions, background choices, graph overlay, project restore, and toasts.

Expected: behavior matches the pre-redesign editor; only placement and presentation change.

- [ ] **Step 5: Verify accessibility and platform fallbacks**

In browser developer tools:

- navigate all actions with Tab and Shift+Tab;
- confirm `:focus-visible` is clear on glass;
- emulate `prefers-reduced-motion: reduce`;
- disable `backdrop-filter` and confirm high-opacity glass remains readable;
- verify active tabs expose `aria-selected` correctly;
- confirm each icon-only button has an accessible name.

Expected: all checks pass without reliance on color or translucency alone.

- [ ] **Step 6: Apply only defect-driven polish and re-run verification**

If a check fails, make the smallest change in the owning UI file, add or tighten a contract assertion when the defect is structural, then run:

```powershell
npm run test:ui
npm run build
git diff --check
```

Expected: seven or more UI tests pass, build succeeds, and `git diff --check` reports no whitespace errors.

- [ ] **Step 7: Commit verified polish if files changed**

```powershell
git add index.html src/style.css src/history-panel.ts tests/ui-layout.test.mjs
git commit -m "fix: polish responsive editor layout"
```

If verification requires no file changes, skip this commit.

- [ ] **Step 8: Final scope audit**

Run:

```powershell
git status --short
git diff HEAD~2..HEAD --name-only
git log -3 --oneline
```

Expected: only the plan/spec, `package.json`, `tests/ui-layout.test.mjs`, `index.html`, `src/style.css`, and `src/history-panel.ts` appear in this feature's commits.
