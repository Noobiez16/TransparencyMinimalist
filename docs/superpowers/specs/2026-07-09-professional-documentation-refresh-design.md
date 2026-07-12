# Professional Documentation Refresh

**Date:** 2026-07-09  
**Status:** Approved for implementation planning  
**Scope:** Rewrite the public README and four top-level documentation guides so they accurately describe the current Transparency editor and serve both users and contributors.

## 1. Goal

Create a cohesive documentation set that matches the implemented Photoshop-style spatial-glass editor, explains the product clearly to new users, and gives contributors reliable technical references.

The refresh must preserve the project's clean Markdown presentation while replacing obsolete architecture, UI, security, workflow, and path information with source-verified content.

## 2. Audience

The documentation serves two audiences:

- **Users** need a clear product overview, setup instructions, workspace orientation, shortcuts, and practical composition recipes.
- **Contributors and maintainers** need accurate architecture, design-system, security, source-layout, and verification references.

The README prioritizes users and routes contributors to deeper guides. The top-level guides provide the technical depth.

## 3. Approved Approach

Use a layered professional refresh:

- rewrite rather than patch isolated paragraphs;
- assign one authoritative subject to each page;
- cross-link pages where a reader naturally needs more detail;
- derive technical claims from the current source tree;
- retain concise, professional Markdown instead of introducing a documentation site or new tooling.

## 4. Document Ownership

### 4.1 `README.md`

The public landing page owns:

- a concise description of Transparency;
- current feature highlights;
- a high-level workspace map;
- installation, development, testing, and production-build commands;
- primary tools and keyboard shortcuts;
- a compact source-tree overview;
- links to all four top-level guides.

The README does not duplicate detailed architecture, design tokens, threat analysis, or full recipes.

### 4.2 `docs/architecture.md`

The architecture guide owns:

- the current document and layer model;
- state notifications and dirty domains;
- command and history flow;
- tool registry and pointer interactions;
- canvas compositor and export parity;
- persistence, autosave, and project-file handling;
- module responsibilities and dependency flow;
- performance characteristics and extension boundaries.

Type names, field names, coordinate units, module paths, and rendering claims must match the current TypeScript implementation.

### 4.3 `docs/design.md`

The design guide owns:

- the Photoshop-style spatial-glass design principles;
- current CSS token relationships;
- application bar, options bar, tool rail, canvas, right dock, and status bar;
- Properties and Layers/History organization;
- interaction, selection, and motion states;
- desktop and compact responsive behavior;
- accessibility and `backdrop-filter` fallbacks.

Historical white, flat, hard-edged design guidance is removed.

### 4.4 `docs/examples.md`

The examples guide owns practical composition workflows:

- transparency-aware artwork;
- double exposure;
- high-contrast text composition;
- an additional workflow that demonstrates project persistence or reusable layer editing when the current controls support it.

Every recipe uses current control names, pixel-based position values, supported blend modes, current effect behavior, and realistic export instructions. Social-platform behavior is described cautiously and not guaranteed when a third-party service may process exported images.

### 4.5 `docs/security-audit.md`

The security guide owns:

- review scope and trust boundaries;
- local-only processing and external font loading;
- text rendering and XSS controls;
- imported image and project-file validation;
- clipboard/drop handling;
- IndexedDB autosave and local privacy implications;
- object URL and export behavior;
- denial-of-service and resource-limit considerations;
- remaining limitations and recommended deployment headers.

The guide is an engineering review, not a formal certification. Code examples are short, current, and tied to the actual owning modules.

## 5. Internal Documentation Boundary

Files under `docs/superpowers/` are immutable historical design and implementation records for this task. They remain unchanged except for this new approved specification and its subsequent implementation plan.

The refresh does not rewrite previous specs or plans to match the current product retroactively.

## 6. Editorial System

### 6.1 Voice

- Concise, confident, and factual.
- Professional without inflated claims such as `professional-grade` when no objective qualification is provided.
- Direct second-person instructions for workflows.
- Precise technical language for architecture and security.

### 6.2 Structure

- One H1 per document.
- A short opening paragraph that defines the page's purpose.
- Descriptive H2/H3 headings.
- Short paragraphs and scannable lists.
- Tables for exact mappings such as shortcuts, tokens, modules, and controls.
- Mermaid only for architecture relationships that are materially clearer as a diagram.
- Code fences include the appropriate language identifier.

### 6.3 Terminology

Use these terms consistently:

- Product: **Transparency**.
- Interface: **Photoshop-style spatial-glass workspace**.
- Central model: **document** and **layers**.
- Layer categories: **image layer** and **text layer**.
- Editing regions: **application bar**, **contextual options bar**, **tool rail**, **canvas workspace**, **Properties**, **Layers/History dock**, and **status bar**.
- Project files: **`.mledit.json` project files**.
- Output: **PNG export**.

Avoid historical names such as `Minimalist Dynamic Layer Image Editor`, `three-column editor`, or `Canvas Preview` unless explicitly identifying obsolete documentation during review.

### 6.4 Links and paths

- Use repository-relative Markdown links.
- Never use `file://` URLs or developer-machine paths.
- Link directly to the owning guide rather than duplicating long explanations.
- Source references use current relative paths such as `src/engine/document.ts`.

## 7. Source-of-Truth Rules

Documentation must be verified against:

- `package.json` for runnable commands;
- `index.html` and `src/style.css` for UI structure and design behavior;
- `src/main.ts`, `src/state.ts`, and `src/dom.ts` for initialization and UI integration;
- `src/engine/document.ts` for the document/layer model;
- `src/engine/commands.ts` and `src/engine/history.ts` for undo/redo;
- `src/engine/tools.ts` and `src/tools/` for tool behavior and shortcuts;
- `src/engine/compositor.ts`, `src/canvas.ts`, and `src/export.ts` for rendering/export;
- `src/engine/persistence.ts` for project files and autosave;
- `src/layers-panel.ts`, `src/properties-panel.ts`, `src/history-panel.ts`, `src/options-bar.ts`, `src/topbar.ts`, and `src/rail.ts` for UI behavior.

Historical specs may explain intent but cannot override implemented source behavior.

## 8. Accuracy and Safety Rules

- Do not claim DOM/CSS live preview if the current editor renders through the canvas compositor.
- Do not document percentage coordinates when the model uses document pixels.
- Do not reproduce obsolete interfaces or field names.
- Do not claim the application is fully offline while Google Fonts are loaded remotely.
- Do not claim third-party social platforms preserve PNG pixels or blending behavior.
- Do not present local-only processing as protection from all browser, extension, hosting, or dependency risks.
- Distinguish implemented safeguards from deployment recommendations.

## 9. Verification

### 9.1 Content checks

- Confirm all five public documents use the approved product name and terminology.
- Search for corrupted character sequences and obsolete product/UI names.
- Search for absolute local paths and `file://` links.
- Confirm every source path, command, ID, shortcut, field, and module named in the documentation exists.
- Confirm no page duplicates another page's authoritative subject in depth.

### 9.2 Markdown checks

- Confirm each file has one H1 and a logical heading hierarchy.
- Confirm every code fence is closed and language-tagged where appropriate.
- Confirm all relative documentation links resolve.
- Confirm Mermaid syntax is simple and renderer-compatible.

### 9.3 Project checks

- Run `npm run test:ui`.
- Run `npm run build`.
- Run `git diff --check`.

These commands verify that documentation edits did not accidentally disturb the implemented editor or repository formatting.

## 10. Completion Criteria

The refresh is complete when `README.md` and the four top-level guides are accurate, professionally consistent, cross-linked, free of corrupted symbols and machine-specific paths, aligned with the current source, and verified by the content, Markdown, UI-contract, build, and diff checks above.
