# Professional Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the public README and five top-level guides into an accurate, cohesive documentation set for Transparency users and contributors.

**Architecture:** Treat the current TypeScript, HTML, CSS, package scripts, Graphify configuration, and generated output names as the only technical source of truth. Give each public document one authoritative topic, connect the set through repository-relative links, and protect terminology, paths, headings, and critical implementation facts with a dependency-free Node documentation contract.

**Tech Stack:** GitHub-Flavored Markdown, Mermaid, TypeScript source references, Node's built-in `node:test` runner, Vite 5 project commands.

## Global Constraints

- Update only `README.md`, the five top-level `docs/*.md` guides, `package.json`, and `tests/documentation.test.mjs`.
- Keep prior files under `docs/superpowers/` unchanged except for this approved spec and plan.
- Standardize the product name as **Transparency**.
- Describe the interface as a **Photoshop-style spatial-glass workspace**.
- Serve users through the README and examples; serve contributors through architecture, design, Graphify, and security guides.
- Derive technical claims from the current implementation, never from historical specs alone.
- Use repository-relative links; never use `file://` URLs or developer-machine paths.
- Remove corrupted character sequences and obsolete product/UI terminology.
- Do not claim DOM/CSS live preview; the current screen and export both use the canvas compositor.
- Document layer centers and effect blur in document pixels, not percentages.
- Do not claim fully offline operation while Google Fonts load remotely.
- Treat the security guide as an engineering review, not a certification.
- Use one H1 per document, logical heading levels, closed language-tagged code fences, and Mermaid only where relationships benefit materially.
- Leave application source, UI behavior, and generated `graphify-out/` files untouched.

---

## File Map

- Create `tests/documentation.test.mjs`: public-document terminology, structure, path, link, and implementation-fact contracts.
- Modify `package.json`: add `test:docs` without adding a dependency.
- Rewrite `README.md`: user-first landing page and navigation hub.
- Rewrite `docs/architecture.md`: authoritative current technical architecture.
- Rewrite `docs/design.md`: authoritative spatial-glass design system.
- Rewrite `docs/examples.md`: current, reproducible composition recipes.
- Rewrite `docs/graphify-guide.md`: portable contributor Graphify workflow.
- Rewrite `docs/security-audit.md`: current security posture, limitations, and deployment recommendations.

---

### Task 1: Establish the documentation contract and rewrite the README

**Files:**
- Create: `tests/documentation.test.mjs`
- Modify: `package.json:6-11`
- Modify: `README.md:1-end`

**Interfaces:**
- Consumes: current scripts from `package.json`, shortcuts from `src/engine/tools.ts` and `src/main.ts`, and the six-document ownership model from the approved spec.
- Produces: reusable `readPublicDoc()`, `assertProfessionalMarkdown()`, and `publicFiles` test helpers; a user-first README linking all five guides.

- [ ] **Step 1: Re-check target files for unrelated edits**

Run:

```powershell
git status --short
git diff -- README.md package.json
```

Expected: no content diff in `README.md` or `package.json`. A line-ending-only working-tree status may appear for `README.md`; confirm `git diff -- README.md` is empty before replacing it.

- [ ] **Step 2: Add the failing README documentation contract**

Create `tests/documentation.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const publicFiles = [
  'README.md',
  'docs/architecture.md',
  'docs/design.md',
  'docs/examples.md',
  'docs/graphify-guide.md',
  'docs/security-audit.md'
];

function readPublicDoc(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assertProfessionalMarkdown(path, text) {
  assert.equal((text.match(/^# /gm) ?? []).length, 1, `${path} must contain one H1`);
  assert.equal((text.match(/```/g) ?? []).length % 2, 0, `${path} has an unclosed code fence`);
  assert.doesNotMatch(text, /[\u00c2\u00c3\u00e2\u00f0]/, `${path} contains corrupted characters`);
  assert.doesNotMatch(text, /file:\/\/|[A-Za-z]:[\\/](?:Users|home)[\\/]/, `${path} contains a machine-specific path`);
}

test('README is the professional user and contributor entry point', () => {
  const readme = readPublicDoc('README.md');
  assertProfessionalMarkdown('README.md', readme);
  assert.match(readme, /^# Transparency$/m);
  assert.match(readme, /Photoshop-style spatial-glass workspace/);
  assert.match(readme, /npm install/);
  assert.match(readme, /npm run dev/);
  assert.match(readme, /npm run test:ui/);
  assert.match(readme, /npm run test:docs/);
  assert.match(readme, /npm run build/);
  for (const guide of publicFiles.slice(1)) {
    assert.match(readme, new RegExp(`\\(${guide.replaceAll('.', '\\.')}\\)`), `README must link ${guide}`);
  }
  for (const shortcut of ['V', 'H', 'Z', 'Space', 'Ctrl+Z']) {
    assert.match(readme, new RegExp(`\\b${shortcut.replace('+', '\\+')}\\b`), `README must document ${shortcut}`);
  }
});

export { assertProfessionalMarkdown, publicFiles, readPublicDoc, root };
```

Update `package.json` scripts to:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test:ui": "node --test tests/ui-layout.test.mjs",
  "test:docs": "node --test tests/documentation.test.mjs"
}
```

- [ ] **Step 3: Run the contract and confirm the intended failure**

Run:

```powershell
npm.cmd run test:docs
```

Expected: FAIL because the current README title is not `Transparency`, contains corrupted symbols, and does not link all five guides.

- [ ] **Step 4: Rewrite the README as the public landing page**

Use this exact section order and factual content:

```markdown
# Transparency

Transparency is a browser-based layer image editor with a Photoshop-style spatial-glass workspace. It combines a document-pixel canvas compositor, image and text layers, reversible commands, local project persistence, and PNG export without introducing a framework or server-side processing pipeline.

## Highlights

- Canvas-based interactive preview and PNG export through the same compositor.
- Image and text layers with visibility, ordering, opacity, blending, transforms, and effects.
- Move, Hand, and Zoom tools with keyboard shortcuts and direct canvas interaction.
- Undo/redo history with coalescing and jump-to-entry navigation.
- `.mledit.json` project save/open, IndexedDB autosave, and session restore.
- Document graph overlay for inspecting layer/effect relationships.
- Responsive Photoshop-style spatial-glass workspace.

## Workspace

| Region | Purpose |
|---|---|
| Application bar | Open, save, undo, redo, and export |
| Contextual options bar | Active-tool options, background, and document size |
| Tool rail | Move, Hand, Zoom, layer creation, graph, and panel visibility |
| Canvas workspace | Interactive document rendering, selection outline, pan, and zoom |
| Properties | Selected-layer transforms, opacity, blending, effects, and text settings |
| Layers / History | Layer stack management and reversible command navigation |

## Quick Start

### Requirements

- Node.js 18 or newer
- npm

```bash
npm install
npm run dev
```

### Verification and production build

```bash
npm run test:ui
npm run test:docs
npm run build
```

## Essential Shortcuts

| Action | Shortcut |
|---|---|
| Move tool | `V` |
| Hand tool | `H` |
| Zoom tool | `Z` |
| Temporary Hand tool | Hold `Space` |
| Undo | `Ctrl+Z` / `Cmd+Z` |
| Redo | `Ctrl+Shift+Z`, `Ctrl+Y`, or platform equivalent |
| Document graph | `G` |
| Close graph overlay | `Escape` |

## Project Structure

Describe `index.html`, `src/`, `src/engine/`, `src/tools/`, `tests/`, `docs/`, and `graphify-out/` in a compact tree. List only current files and describe `src/engine/compositor.ts` as the shared preview/export renderer.

## Documentation

- [Architecture](docs/architecture.md)
- [Design system](docs/design.md)
- [Composition examples](docs/examples.md)
- [Graphify guide](docs/graphify-guide.md)
- [Security review](docs/security-audit.md)

## Data and privacy

State that imported media, project autosaves, and exports remain in the browser by default, while the Inter font is requested from Google Fonts unless the HTML font imports are changed. Link to the security review for limits and deployment guidance.
```

Write complete prose under `Project Structure` and `Data and privacy`; do not copy the instruction sentences into the final README.

- [ ] **Step 5: Verify and commit Task 1**

Run:

```powershell
npm.cmd run test:docs
npm.cmd run test:ui
git diff --check
```

Expected: the README contract passes, all UI contracts pass, and the diff check reports no errors.

Commit:

```powershell
git add README.md package.json tests/documentation.test.mjs
git commit -m "docs: refresh project overview"
```

---

### Task 2: Rewrite the architecture and design-system guides

**Files:**
- Modify: `tests/documentation.test.mjs`
- Modify: `docs/architecture.md:1-end`
- Modify: `docs/design.md:1-end`

**Interfaces:**
- Consumes: `Doc`, `Layer`, `Effects`, `DirtyFlag`, `Command`, `Tool`, compositor, persistence, and CSS token definitions from current source.
- Produces: authoritative contributor architecture and UI-design references linked from the README.

- [ ] **Step 1: Append failing architecture/design contracts**

Append:

```js
test('architecture guide matches the current document and rendering model', () => {
  const architecture = readPublicDoc('docs/architecture.md');
  assertProfessionalMarkdown('docs/architecture.md', architecture);
  for (const fact of [
    'interface Doc',
    "kind: 'image'",
    "kind: 'text'",
    'document pixels',
    'DirtyFlag',
    'structure',
    'selection',
    'layerProps',
    'canvasConfig',
    'composite',
    '50 entries',
    '150 MiB',
    '800 ms',
    'IndexedDB',
    'src/engine/compositor.ts'
  ]) assert.match(architecture, new RegExp(fact.replaceAll('.', '\\.')));
  assert.doesNotMatch(architecture, /LayerState|AppState|xOffset|yOffset|DOM updates|percentage coordinates/i);
});

test('design guide documents the implemented spatial-glass system', () => {
  const design = readPublicDoc('docs/design.md');
  assertProfessionalMarkdown('docs/design.md', design);
  for (const fact of [
    '--app-bg', '--glass', '--glass-strong', '--glass-line',
    'application bar', 'contextual options bar', 'tool rail',
    'canvas workspace', 'Layers / History', '1024px and above',
    '1023px and below', 'backdrop-filter', 'prefers-reduced-motion'
  ]) assert.match(design, new RegExp(fact.replaceAll('.', '\\.')));
  assert.doesNotMatch(design, /#FFFFFF.*Primary Background|three-column|0px border-radii|No Drop Shadows/i);
});
```

- [ ] **Step 2: Run the new contracts and confirm the failures**

Run:

```powershell
npm.cmd run test:docs
```

Expected: README test passes; architecture fails on obsolete interfaces/DOM-preview claims; design fails on the historical white flat system.

- [ ] **Step 3: Rewrite `docs/architecture.md`**

Use this section order:

```markdown
# Architecture

## System Overview
## Document Model
## State and Notification Flow
## Commands and History
## Tool System and Pointer Routing
## Compositor and Export Parity
## Persistence and Autosave
## UI Module Boundaries
## Performance Characteristics
## Extending the Editor Safely
```

Required content:

- A Mermaid flow from UI/tool input to commands/state, dirty notifications, the canvas compositor, persistence, and PNG export.
- A current TypeScript excerpt showing `BlendMode`, `Effects`, `LayerBase`, image/text discriminated unions, and `Doc` fields from `src/engine/document.ts`.
- Explain `layers[0]` is topmost, `x`/`y` are layer-center document pixels, scale is 10-400 percent, and blur/font size are document pixels.
- List all five `DirtyFlag` values and explain requestAnimationFrame batching.
- Document history caps: 50 entries, 150 MiB, 800 ms coalescing, redo-tail truncation, saved cursor tracking, and jump navigation.
- Explain tool registration and pointer conversion through `screenToDoc()`.
- Explain that `composite()` draws both the interactive screen canvas and `renderToCanvas()` export; export omits the selection overlay.
- Document `.mledit.json` envelope compatibility, PNG-encoded image data, object URLs, IndexedDB database `mledit`, store `autosave`, two-second debounce, serialized autosave chain, and restore offer.
- Include a module-responsibility table using current paths.

- [ ] **Step 4: Rewrite `docs/design.md`**

Use this section order:

```markdown
# Design System

## Design Principles
## Spatial Glass Tokens
## Desktop Workspace
## Component Patterns
## Interaction States
## Responsive Layout
## Accessibility and Fallbacks
## Contribution Guidelines
```

Required content:

- Define balanced spatial glass as readable dark tint, restrained blur, fine highlight borders, and quiet environmental gradients.
- Include a token table for the current `:root` variables and describe relationships rather than pretending all translucent tokens have fixed hex values.
- Document the application bar, contextual options bar, tool rail, document tab/canvas workspace, Properties, Layers/History, and status bar.
- State desktop applies at 1024px and above; compact stacking applies at 1023px and below; narrow refinements apply at 640px and below.
- Document active tool, tab, layer, range, toggle, toast, graph overlay, and focus-visible states.
- Document the solid `--glass-strong` fallback and reduced-motion rule.

- [ ] **Step 5: Verify and commit Task 2**

Run:

```powershell
npm.cmd run test:docs
npm.cmd run test:ui
git diff --check
```

Expected: README, architecture, design, and UI contracts pass.

Commit:

```powershell
git add docs/architecture.md docs/design.md tests/documentation.test.mjs
git commit -m "docs: align architecture and design guides"
```

---

### Task 3: Rewrite examples, Graphify, and security guides

**Files:**
- Modify: `tests/documentation.test.mjs`
- Modify: `docs/examples.md:1-end`
- Modify: `docs/graphify-guide.md:1-end`
- Modify: `docs/security-audit.md:1-end`

**Interfaces:**
- Consumes: current UI labels and effect/blend options, `.graphifyignore`, persistence/file import code, IndexedDB behavior, and external font dependency.
- Produces: reproducible user workflows and accurate contributor/security references.

- [ ] **Step 1: Append failing examples/Graphify/security contracts**

Append:

```js
test('composition examples use current controls and cautious claims', () => {
  const examples = readPublicDoc('docs/examples.md');
  assertProfessionalMarkdown('docs/examples.md', examples);
  for (const fact of [
    'Transparent', 'Multiply', 'Screen', 'Overlay',
    'Opacity', 'Brightness', 'Contrast', 'Saturation',
    'Blur', 'document pixels', '.mledit.json', 'PNG'
  ]) assert.match(examples, new RegExp(fact.replaceAll('.', '\\.')));
  assert.doesNotMatch(examples, /xOffset|yOffset|Twitter\/X.*will reveal|guaranteed/i);
});

test('Graphify guide is portable and explains generated artifacts', () => {
  const graphify = readPublicDoc('docs/graphify-guide.md');
  assertProfessionalMarkdown('docs/graphify-guide.md', graphify);
  for (const fact of [
    'python -m graphify . --directed',
    'graphify-out/graph.html',
    'graphify-out/GRAPH_REPORT.md',
    'graphify-out/graph.json',
    '.graphifyignore'
  ]) assert.match(graphify, new RegExp(fact.replaceAll('.', '\\.')));
  assert.doesNotMatch(graphify, /file:\/\/|C:\\Users\\/);
});

test('security guide documents safeguards and remaining limitations', () => {
  const security = readPublicDoc('docs/security-audit.md');
  assertProfessionalMarkdown('docs/security-audit.md', security);
  for (const fact of [
    'Engineering review',
    'Google Fonts',
    'CanvasRenderingContext2D',
    'object URL',
    'IndexedDB',
    'minimalist-editor',
    'version: 1',
    'resource exhaustion',
    'Content-Security-Policy'
  ]) assert.match(security, new RegExp(fact.replaceAll('.', '\\.')));
  assert.match(security, /does not fully validate|remaining limitation/i);
  assert.doesNotMatch(security, /completely client-side.*No.*external|inherently immune|formal certification/i);
});
```

- [ ] **Step 2: Run the new contracts and confirm the failures**

Run:

```powershell
npm.cmd run test:docs
```

Expected: earlier contracts pass; examples fail on percentage/stale social claims, Graphify fails on the absolute `file://` path, and security fails on obsolete code/module claims and missing limitations.

- [ ] **Step 3: Rewrite `docs/examples.md`**

Use this section order:

```markdown
# Composition Examples

## Before You Start
## Transparency-Aware Artwork
## Double Exposure
## High-Contrast Editorial Text
## Reusable Project Workflow
## Export Checklist
```

Required content:

- Explain layer 0/top of the panel is visually topmost.
- Use supported blend modes with UI capitalization.
- Use `x`/`y` center positions in document pixels; advise using the document center rather than percentage offsets.
- Explain effects must be enabled before their values affect output.
- State PNG preserves transparency, but hosting/social services may recompress or flatten images.
- Show save/open with `.mledit.json`, autosave restore, and separate PNG export.

- [ ] **Step 4: Rewrite `docs/graphify-guide.md`**

Use this section order:

```markdown
# Graphify Codebase Guide

## Purpose
## Generated Artifacts
## Generate or Refresh the Graph
## Query the Graph
## Read the Results
## Exclusions and Maintenance
```

Required content:

- State Graphify is an optional contributor tool and show installation-neutral commands assuming `python -m graphify` is available.
- Document graph HTML, report, and JSON outputs.
- Keep the generation, query, path, and explain examples.
- Link `.graphifyignore` as `../.graphifyignore` from the guide.
- Explain current exclusions include dependencies, build output, configuration files, package metadata, docs, and Superpowers artifacts.

- [ ] **Step 5: Rewrite `docs/security-audit.md`**

Use this section order:

```markdown
# Security Review

## Scope and Trust Boundaries
## Data Flow and Privacy
## Text and DOM Safety
## Image Import, Clipboard, and Drop Handling
## Project Files and Persistence
## Export and Object URLs
## Resource Exhaustion Risks
## Deployment Recommendations
## Remaining Limitations
```

Required content:

- Note Inter is fetched from Google Fonts; imported media and project/autosave data otherwise stay in browser storage/memory unless the user saves or exports.
- Explain text layers render with `CanvasRenderingContext2D.fillText`, while UI-generated names use `textContent`; fixed internal icon/card templates use `innerHTML` with trusted strings.
- Explain MIME-prefix checks for image import, object URL revocation on success/error, and paste suppression in active inputs.
- Explain the project envelope checks app marker and version but casts much of the nested document without full schema/range validation.
- Explain IndexedDB stores serialized projects including image data URLs and persists until browser storage is cleared.
- Explain export/save object URLs are revoked after triggering download.
- Document memory/CPU risks from large image dimensions, Base64 project size, compositor work, and history's 150 MiB estimate cap.
- Recommend CSP, restrictive hosting headers, dependency review, upload-size/dimension validation, and a self-hosted/system-font option for stricter privacy.

- [ ] **Step 6: Verify and commit Task 3**

Run:

```powershell
npm.cmd run test:docs
npm.cmd run test:ui
git diff --check
```

Expected: all topic contracts and UI contracts pass.

Commit:

```powershell
git add docs/examples.md docs/graphify-guide.md docs/security-audit.md tests/documentation.test.mjs
git commit -m "docs: refresh workflows and security guidance"
```

---

### Task 4: Add global documentation integrity checks and perform final audit

**Files:**
- Modify: `tests/documentation.test.mjs`
- Modify only if audit finds a factual or link defect: the owning public Markdown document.

**Interfaces:**
- Consumes: all six rewritten documents and the reusable Task 1 helpers.
- Produces: repository-relative link validation and final documentation-quality evidence.

- [ ] **Step 1: Add the global integrity tests**

Append:

```js
test('all public documents meet global Markdown and terminology rules', () => {
  for (const path of publicFiles) {
    const text = readPublicDoc(path);
    assertProfessionalMarkdown(path, text);
    assert.doesNotMatch(text, /Minimalist Dynamic Layer Image Editor|Canvas Preview|xOffset|yOffset/);
  }
});

test('all repository-relative Markdown links resolve', () => {
  for (const path of publicFiles) {
    const text = readPublicDoc(path);
    const base = dirname(resolve(root, path));
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^(?:https?:|mailto:|#)/.test(href)) continue;
      const target = decodeURIComponent(href.split('#')[0]);
      assert.equal(existsSync(resolve(base, target)), true, `${path} has broken link ${href}`);
    }
  }
});
```

- [ ] **Step 2: Run the complete documentation and project verification**

Run:

```powershell
npm.cmd run test:docs
npm.cmd run test:ui
npm.cmd run build
git diff --check
```

Expected: all documentation tests pass, all eight UI tests pass, TypeScript/Vite build succeeds, and the diff check reports no errors.

- [ ] **Step 3: Run targeted content scans**

Run:

```powershell
rg -n "[\x{00C2}\x{00C3}\x{00E2}\x{00F0}]|file://|[A-Za-z]:[\\/](Users|home)[\\/]" README.md docs -g "*.md" -g "!superpowers/**"
rg -n "Minimalist Dynamic Layer Image Editor|Canvas Preview|LayerState|AppState|xOffset|yOffset|percentage coordinates|DOM updates" README.md docs -g "*.md" -g "!superpowers/**"
rg -n "TO[D]O|TB[D]|FIXM[E]" README.md docs -g "*.md" -g "!superpowers/**"
```

Expected: no matches. If a command exits with code 1 because no matches were found, that is the successful result.

- [ ] **Step 4: Review the final documentation diff**

Run:

```powershell
git diff HEAD~3..HEAD -- README.md docs/architecture.md docs/design.md docs/examples.md docs/graphify-guide.md docs/security-audit.md tests/documentation.test.mjs package.json
```

Check each source claim against the owning TypeScript/CSS/config file listed in the approved spec. Correct only factual, structural, terminology, or link defects found during this audit.

- [ ] **Step 5: Commit final integrity checks or audit corrections**

```powershell
git add tests/documentation.test.mjs README.md docs/architecture.md docs/design.md docs/examples.md docs/graphify-guide.md docs/security-audit.md
git commit -m "test: verify public documentation integrity"
```

If the global integrity test was already committed with Task 3 and the audit makes no changes, skip this commit.

- [ ] **Step 6: Confirm final scope**

Run:

```powershell
git status --short
git diff --name-only 35d41ec..HEAD
```

Expected changed files for this documentation refresh: `README.md`, `package.json`, `tests/documentation.test.mjs`, `docs/architecture.md`, `docs/design.md`, `docs/examples.md`, `docs/graphify-guide.md`, and `docs/security-audit.md`, plus this plan. Application source and generated graph output must not change.
