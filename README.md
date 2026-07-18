# Transparency

Transparency is a browser-based layer image editor with a Photoshop-style spatial-glass workspace. It combines a document-pixel canvas compositor, image and text layers, reversible commands, local project persistence, and PNG export without introducing a framework or server-side processing pipeline.

## Highlights

- Canvas-based interactive preview and PNG export through the same compositor.
- Image and text layers with visibility, ordering, opacity, blending, transforms, and effects.
- Move, Hand, Zoom, and Crop tools with keyboard shortcuts and direct canvas interaction.
- Free Transform sessions with per-axis scaling, rotation, and precise field entry.
- Smart alignment guides that snap moves and resizes to the document and to other layers.
- Non-destructive document crop with aspect-ratio presets and exact undo.
- Undo/redo history with coalescing and jump-to-entry navigation.
- `.mledit.json` project save/open, IndexedDB autosave, and session restore.
- Responsive Photoshop-style spatial-glass workspace.

## Workspace

| Region | Purpose |
|---|---|
| Application menu bar | Eleven Photoshop-style menus (File, Edit, Image, Layer, Type, Select, Filter, View, Plugins, Window, Help); commands from future phases render grayed |
| Contextual options bar | Active-tool options, background, and document size |
| Toolbar | Grouped tool slots with nested-tool flyouts (right-click), a single/double column toggle, and foreground/background color chips |
| Canvas workspace | Interactive document rendering, a document tab with live zoom, pasteboard shades, selection outline, pan, and zoom |
| Properties | Selected-layer transforms, opacity, blending, effects, and text settings |
| Layers / History | Layer stack management and reversible command navigation, tabbed with grayed Channels and Paths slots |
| Color / Swatches | Foreground color sliders with hex entry, plus a persistent swatch library |
| Status bar | Typeable zoom field, per-tool hints, and a cycling diagnostics metric |

`Window > Workspace: Reset Essentials` restores the default layout at any time.

## Editing Workflow

Select a layer with the Move tool and drag its handles to scale or rotate directly, or press `Ctrl+T` for an explicit Free Transform session with editable X, Y, width, height, and rotation fields. Hold `Shift` to constrain a drag, press `Enter` to apply the session, and press `Escape` to cancel it. While a layer moves or resizes, smart alignment guides snap it to the document center, the document edges, and other visible layers; hold `Ctrl/Cmd` to bypass snapping for the current gesture, or turn Snap off in the options bar.

The Crop tool (`C`) frames a non-destructive document crop: choose a free, original, preset, or custom aspect ratio, drag the handles or the window, and confirm with `Enter` (or the Apply button). Cropping only changes the document bounds and layer positions, never layer pixels, so a single undo restores the previous geometry exactly.

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
| Crop tool | `C` |
| Free Transform session | `Ctrl+T` / `Cmd+T` |
| Apply transform or crop session | `Enter` |
| Cancel transform or crop session | `Escape` |
| Constrain a drag | Hold `Shift` |
| Bypass smart guides while dragging | Hold `Ctrl/Cmd` |
| Temporary Hand tool | Hold `Space` |
| Undo | `Ctrl+Z` / `Cmd+Z` |
| Redo | `Ctrl+Shift+Z`, `Ctrl+Y`, or platform equivalent |
| Open project | `Ctrl+O` |
| Save project | `Ctrl+S` |
| Duplicate layer | `Ctrl+J` |
| Fit on screen | `Ctrl+0` |
| Default colors (black/white) | `D` |
| Swap foreground/background colors | `X` |
| Hide all panels and toolbars | `Tab` |
| Hide only the right docks | `Shift+Tab` |
| Focus the Color panel | `F6` |
| Focus the Layers panel | `F7` |

## Project Structure

```text
index.html                  Editor shell and browser entry point
src/                        Editor UI, state, panels, export, and orchestration
├── engine/                 Document model, commands, history, tools, sessions, and persistence
│   └── compositor.ts       Shared preview/export renderer
└── tools/                  Move, Hand, Zoom, and Crop tool implementations
tests/                      Engine, UI layout, and public documentation contracts
docs/                       Architecture, design, examples, and security guides
```

## Documentation

- [Architecture](docs/architecture.md)
- [Design system](docs/design.md)
- [Composition examples](docs/examples.md)
- [Security review](docs/security-audit.md)
- [Changelog](docs/changelog.md)

## Roadmap

Projects saved by earlier releases (version 1) still open and are migrated to the version 2 affine format on load. The editing surface intentionally stops at single-layer transforms today: layer groups and masks, rulers with persistent manual guides, skew and warp transforms, and per-layer or destructive cropping are future roadmap items and are not part of the current release.

## Data and privacy

Imported media, project autosaves, and exports remain in the browser by default. The Inter font is requested from Google Fonts unless the font imports in `index.html` are changed. See the [security review](docs/security-audit.md) for the current limits and deployment guidance.
