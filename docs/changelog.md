# Changelog

Notable changes to the Transparency editor. Each release was delivered through a written specification and implementation plan; plan documents are removed from the repository once their release ships, so entries reference plans by name only.

## 3.0.0 - 2026-07-13

### Added

- **Professional core editing workflow**: version 2 affine document model (`x`, `y`, `scaleX`, `scaleY`, `rotation` on every layer) with automatic migration of version 1 projects on open, direct on-canvas transforms, an explicit Free Transform session (`Ctrl+T`, `Enter` applies, `Escape` cancels), smart alignment guides with a `Ctrl/Cmd` bypass, and a non-destructive document crop tool (`C`) with aspect-ratio presets, a validated custom ratio, and exact single-step undo. (Plan: 2026-07-12-professional-core-editing-workflow.)
- **TypeScript test infrastructure**: Vitest engine suites plus Node test-runner UI and documentation contracts (`npm run test:core`, `npm run test:ui`, `npm run test:docs`).

### Fixed

- Tool switches during a live drag now interrupt the gesture instead of leaving two editing sessions active, and history navigation is blocked while a transform or crop session is open.

## 2.0.0 - 2026-07-12

### Removed

- **In-editor Document Graph**: removed the runtime graph overlay (markup, panels, styles, icons, and listeners) to eliminate its DOM-injection surface, while retaining contributor-side documentation graphs. (Plan: 2026-07-12-remove-document-graph.)

## 1.5.0 - 2026-07-09

### Added

- **Spatial-glass workspace**: Photoshop-style regions with glassmorphism styling, backdrop filters, floating surfaces, and refined scrollbars. (Plan: 2026-07-09-spatial-glass-photoshop-editor-ui.)
- **Documentation refresh**: unified workspace documentation, architecture guide, and security disclosures. (Plan: 2026-07-09-professional-documentation-refresh.)
- **Structural code mapping**: contributor-side integration of a local structural mapping tool for architecture visualization. (Plan: 2026-07-09 series.)

## 1.0.0 - 2026-07-04

### Added

- **Core canvas engine**: document-pixel model, shared preview/export compositor, command-based undo/redo with history panel, Move/Hand/Zoom tools, preview zoom from 25 to 400 percent, `.mledit.json` project save/open with IndexedDB autosave, and PNG export. (Plan: 2026-07-04-core-canvas-engine.)

## 0.5.0 - 2026-07-03

### Added

- **Dark studio redesign**: rebuilt panels (layers, history, properties), effect stack, micro-animations, and responsive layout rules. (Plan: 2026-07-03-minimalist-editor-dark-studio-redesign.)
