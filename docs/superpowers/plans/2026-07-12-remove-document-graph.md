# Remove the In-Editor Document Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Transparency's in-editor Document Graph completely while preserving Graphify and the architecture Mermaid diagram.

**Architecture:** Delete the graph as one runtime feature boundary: markup, initialization, module, icon, listeners, animation, and CSS disappear together. Protect that removal with negative runtime contracts, then update only the public documents that advertise or assess the deleted feature while retaining positive Graphify and Mermaid contracts.

**Tech Stack:** TypeScript, browser DOM and Canvas APIs, HTML, CSS, Node's built-in `node:test`, Vite 5.

## Global Constraints

- Delete the in-editor Document Graph; do not hide it or retain dormant feature-flagged code.
- Leave `G` intentionally unassigned.
- Preserve `.graphifyignore`, `docs/graphify-guide.md`, and all existing `graphify-out/` content.
- Preserve the Mermaid system diagram in `docs/architecture.md`.
- Do not change document state, project serialization, autosave, history, compositor, export, or project compatibility.
- Do not redesign the tool rail, canvas workspace, inspector dock, or responsive grid.
- Remove only the graph-detail DOM-injection security finding; preserve all unrelated security limitations and deployment recommendations.
- Do not implement resizable panels, video layers, or any later editing feature from the broader request.
- Use `npm.cmd` for package commands in PowerShell.
- Keep the pre-existing untracked `graphify-out/` directory untouched.

---

## File Map

- Delete `src/graph-panel.ts`: the complete runtime graph implementation.
- Modify `index.html`: remove the rail button and overlay subtree.
- Modify `src/main.ts`: remove the graph import and initialization call.
- Modify `src/dom.ts`: remove the now-unused graph icon.
- Modify `src/style.css`: remove graph base, responsive, and fallback selectors.
- Modify `tests/ui-layout.test.mjs`: replace graph-presence requirements with full-removal contracts.
- Modify `README.md`: remove the runtime graph highlight, rail claim, and shortcuts while preserving Graphify navigation.
- Modify `docs/architecture.md`: remove the runtime module/performance claims while preserving Mermaid.
- Modify `docs/design.md`: remove runtime graph component, interaction, responsive, and fallback guidance.
- Modify `docs/security-audit.md`: remove the deleted graph-detail sink and remediation while retaining other risks.
- Modify `tests/documentation.test.mjs`: protect the public-document distinction between the removed editor graph and preserved contributor graphs.

---

### Task 1: Remove the Document Graph runtime boundary

**Files:**
- Modify: `tests/ui-layout.test.mjs:1-65`
- Modify: `index.html:70-77,251-266`
- Modify: `src/main.ts:1-12,68-80`
- Modify: `src/dom.ts:7-25`
- Modify: `src/style.css:1197-1266,1349-1356,1416-1423`
- Delete: `src/graph-panel.ts`

**Interfaces:**
- Consumes: the existing static HTML/CSS/source contract pattern in `tests/ui-layout.test.mjs`.
- Produces: an editor runtime with no graph DOM, initializer, icon, module, listeners, animation loop, or styles; `G` is unassigned because no replacement shortcut handler is added.

- [ ] **Step 1: Add the failing full-removal contract**

Change the Node filesystem import and load the two runtime source files:

```js
import { existsSync, readFileSync } from 'node:fs';

const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
const dom = readFileSync(resolve(root, 'src/dom.ts'), 'utf8');
```

Remove `'rail-graph'`, `'graph-overlay'`, and `'graph-canvas'` from the `feature-owned ids remain available after the layout move` array. Then append this test before the exports:

```js
test('the in-editor Document Graph runtime is fully removed', () => {
  for (const id of [
    'rail-graph', 'graph-overlay', 'graph-canvas', 'graph-search',
    'graph-info', 'graph-legend', 'graph-footer'
  ]) {
    assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`), `unexpected #${id}`);
  }

  assert.doesNotMatch(main, /graph-panel|initGraphPanel/);
  assert.doesNotMatch(dom, /\bgraph\s*:/);
  assert.doesNotMatch(css, /(?:\.|#)graph-(?:overlay|canvas|side|search|info|legend|footer)\b/);
  assert.equal(existsSync(resolve(root, 'src/graph-panel.ts')), false);
});
```

Extend the export statement so later tests can inspect the loaded sources if needed:

```js
export { html, css, topbar, main, dom };
```

- [ ] **Step 2: Run the UI contract and verify the intended RED state**

Run:

```powershell
npm.cmd run test:ui
```

Expected: the new test fails on the existing graph IDs, `initGraphPanel`, `icons.graph`, graph selectors, and existing `src/graph-panel.ts`. Existing workspace tests continue to pass.

- [ ] **Step 3: Remove the graph markup and runtime entry points**

In `index.html`, remove this rail control:

```html
<button class="rail-btn" id="rail-graph" title="Document graph (G)" aria-label="Document graph"></button>
```

Remove the complete overlay subtree beginning with:

```html
<div class="graph-overlay" id="graph-overlay">
```

and ending with its matching closing `</div>` immediately before the module script.

In `src/main.ts`, delete both lines:

```ts
import { initGraphPanel } from './graph-panel';
initGraphPanel();
```

Do not add another `G` handler. The registered Move, Hand, and Zoom tool shortcuts remain the only single-key tool shortcuts.

- [ ] **Step 4: Remove the graph icon, styles, and module**

Delete the `graph` property from `icons` in `src/dom.ts`:

```ts
graph: svg('<circle cx="8" cy="4" r="2"/><circle cx="3.5" cy="11.5" r="2"/><circle cx="12.5" cy="11.5" r="2"/><line x1="7" y1="5.8" x2="4.5" y2="9.8"/><line x1="9" y1="5.8" x2="11.5" y2="9.8"/><line x1="5.5" y1="11.5" x2="10.5" y2="11.5"/>'),
```

Delete the complete `/* Graph overlay */` block in `src/style.css`, covering these selectors:

```css
.graph-overlay
.graph-overlay.open
#graph-canvas
.graph-side
#graph-search
.graph-info
.graph-legend
.graph-info
.graph-legend
.graph-legend .dot
.graph-footer
```

Within `@media (max-width: 1023px)`, delete only the `.graph-overlay` and `.graph-side` rules. Within `@supports not (backdrop-filter: blur(1px))`, remove `.graph-overlay` from the selector list so it becomes:

```css
@supports not (backdrop-filter: blur(1px)) {
  .glass-surface,
  .size-menu,
  .toast {
    background: var(--glass-strong);
  }
}
```

Delete `src/graph-panel.ts` in full. Do not change canvas, state, persistence, history, rail, or compositor modules.

- [ ] **Step 5: Verify the runtime removal**

Run:

```powershell
npm.cmd run test:ui
npm.cmd run build
rg -n -i "rail-graph|graph-overlay|graph-canvas|graph-side|graph-search|graph-info|graph-legend|graph-footer|initGraphPanel|graph-panel|icons\.graph" index.html src
git diff --check
```

Expected: all UI tests pass; TypeScript/Vite build succeeds; the `rg` command exits 1 with no matches; the diff check reports no errors. If the build is sandbox-blocked from reading `vite.config.ts`, rerun the same build with the environment's normal approval mechanism rather than changing project files.

- [ ] **Step 6: Commit Task 1**

```powershell
git add index.html src/main.ts src/dom.ts src/style.css tests/ui-layout.test.mjs
git add -u src/graph-panel.ts
git commit -m "refactor: remove document graph runtime"
```

---

### Task 2: Align public documentation and security contracts

**Files:**
- Modify: `tests/documentation.test.mjs:1-160`
- Modify: `README.md:5-25,45-72`
- Modify: `docs/architecture.md:140-165`
- Modify: `docs/design.md:41-102`
- Modify: `docs/security-audit.md:17-24,35-73`
- Preserve unchanged: `docs/graphify-guide.md`

**Interfaces:**
- Consumes: Task 1's absence of `src/graph-panel.ts` and all runtime graph entry points.
- Produces: public documentation that describes no editor graph, retains the Graphify contributor workflow and architecture Mermaid diagram, and removes only the resolved graph-detail injection finding.

- [ ] **Step 1: Add failing documentation distinction contracts**

In the security test, remove these resolved graph-sink assertions:

```js
assert.match(security, /DOM injection/i);
assert.match(security, /(?:eliminate|avoid) project-derived `innerHTML`/i);
assert.match(security, /(?:DOM nodes.*`textContent`|`textContent`.*DOM nodes)/i);
assert.doesNotMatch(security, /main remaining.*resource exhaustion rather than script execution/i);
```

Keep every project-validation, remote-bitmap, canvas-taint, CSP, Google Fonts, IndexedDB, object URL, and resource-exhaustion assertion. Add:

```js
assert.doesNotMatch(security, /graph detail|project-derived `innerHTML`|DOM injection|script-execution risk/i);
```

Append this separate preservation/removal contract:

```js
test('public docs preserve Graphify and Mermaid without advertising an editor graph', () => {
  for (const path of [
    'README.md',
    'docs/architecture.md',
    'docs/design.md',
    'docs/security-audit.md'
  ]) {
    const text = readPublicDoc(path);
    assert.doesNotMatch(
      text,
      /Document graph|graph overlay|src\/graph-panel\.ts|graph animation|graph detail/i,
      `${path} still describes the removed editor graph`
    );
  }

  const architecture = readPublicDoc('docs/architecture.md');
  const graphify = readPublicDoc('docs/graphify-guide.md');
  assert.match(architecture, /```mermaid/);
  assert.match(graphify, /python -m graphify \. --directed/);
  assert.match(graphify, /graphify-out\/graph\.html/);
  assert.match(graphify, /\.graphifyignore/);
});
```

- [ ] **Step 2: Run the documentation contract and verify the intended RED state**

Run:

```powershell
npm.cmd run test:docs
```

Expected: the new contract fails because README, architecture, design, and security still describe the removed editor graph. Graphify and Mermaid assertions already pass.

- [ ] **Step 3: Update README, architecture, and design guidance**

Make these exact content changes in `README.md`:

- Delete `Document graph overlay for inspecting layer/effect relationships.` from Highlights.
- Change the Tool rail purpose to `Move, Hand, Zoom, layer creation, and panel visibility`.
- Delete the `Document graph | G` and `Close graph overlay | Escape` shortcut rows.
- Change the project-tree docs description to `Architecture, design, examples, Graphify, and security guides`.
- Preserve `graphify-out/`, the Graphify explanatory paragraph, and the Graphify guide link.

In `docs/architecture.md`:

- Delete the `src/graph-panel.ts` row from the module-responsibility table.
- Change the final Performance Characteristics paragraph to end after `out-of-order IndexedDB writes.`; delete the graph-animation sentence.
- Leave the complete Mermaid fence and its nodes/edges unchanged.

In `docs/design.md`:

- Change the tool-rail description to `registered Move, Hand, and Zoom tools, quick layer creation, and inspector visibility controls`.
- Change the Glass surfaces guidance to reserve `--glass-strong` for `floating menus and toasts`.
- Delete the graph-overlay sentence from Transient surfaces.
- Delete the Graph overlay bullet from Interaction States.
- Delete `the graph side panel is hidden` from Compact Responsive Layout.
- Remove `the graph overlay` from the no-blur fallback sentence, leaving `.glass-surface`, menus, and toasts.

- [ ] **Step 4: Update the security review for the removed sink**

Replace the graph-specific paragraphs under Text and DOM Safety with:

```markdown
Some fixed internal icon, layer-card, and effect-row templates use `innerHTML` with application-defined markup. Current user-facing layer names and status strings remain on `textContent` paths, while layer text remains in Canvas 2D rendering. Contributors should keep untrusted project values out of HTML interpolation when adding future UI.
```

In Project Files and Persistence, change the final sentence of the nested-validation paragraph to:

```markdown
A malformed or adversarial project can also reach browser decoding, allocation, and rendering paths with unexpected values. Treat `.mledit.json` files as untrusted input.
```

Delete this Deployment Recommendations bullet entirely:

```markdown
- Eliminate project-derived `innerHTML` in graph details: build DOM nodes and assign project values with `textContent`. As defense in depth, validate nested project enums and ranges, and escape any unavoidable HTML interpolation.
```

In Remaining Limitations, delete only this sentence:

```markdown
Project-derived graph details also retain a DOM-injection and script-execution risk while they use `innerHTML`.
```

Preserve the crafted-project remote bitmap request, request-metadata privacy, canvas-taint/export failure, `data:image/png;base64,` validation, bitmap size/dimension limits, and `img-src 'self' data: blob:` guidance verbatim.

- [ ] **Step 5: Run complete verification and targeted preservation scans**

Run:

```powershell
npm.cmd run test:docs
npm.cmd run test:ui
npm.cmd run build
git diff --check
rg -n -i "Document graph|graph overlay|src/graph-panel\.ts|graph animation|graph detail|project-derived" README.md docs/architecture.md docs/design.md docs/security-audit.md
rg -n "mermaid|python -m graphify|graphify-out|\.graphifyignore" README.md docs/architecture.md docs/graphify-guide.md
git status --short
```

Expected:

- Documentation and UI tests pass.
- TypeScript/Vite build succeeds.
- Diff check reports no errors.
- The first `rg` exits 1 with no matches.
- The second `rg` reports the Mermaid fence plus README/Graphify guide preservation references.
- Status shows only the planned Task 2 files plus the pre-existing untracked `graphify-out/` directory.

- [ ] **Step 6: Review final scope and commit Task 2**

Run:

```powershell
git diff --name-status HEAD~1..HEAD
git diff -- README.md docs/architecture.md docs/design.md docs/security-audit.md tests/documentation.test.mjs
```

Confirm that the Task 1 commit contains only runtime/test removal and the pending Task 2 diff contains only documentation/test reconciliation. Confirm `docs/graphify-guide.md`, `.graphifyignore`, and `graphify-out/` are unchanged.

Commit:

```powershell
git add README.md docs/architecture.md docs/design.md docs/security-audit.md tests/documentation.test.mjs
git commit -m "docs: remove document graph references"
```

---

## Final Acceptance Audit

After both task commits, run:

```powershell
npm.cmd run test:ui
npm.cmd run test:docs
npm.cmd run build
git diff --check
git status --short
git log -3 --oneline
```

Acceptance evidence must show:

- No in-editor graph button, overlay, module, icon, listener, animation, CSS, or runtime documentation claim remains.
- `G` has no assignment.
- Graphify and the architecture Mermaid diagram remain.
- Existing project files, rendering, history, Layers/History panels, canvas workspace, inspector controls, and responsive layout are unchanged.
- The graph-detail injection finding is gone, while unrelated security limitations remain.
- UI tests, documentation tests, and production build pass.
- The pre-existing untracked `graphify-out/` directory remains untouched.
