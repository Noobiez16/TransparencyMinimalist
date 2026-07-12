# Transparency

Transparency is a browser-based layer image editor with a Photoshop-style spatial-glass workspace. It combines a document-pixel canvas compositor, image and text layers, reversible commands, local project persistence, and PNG export without introducing a framework or server-side processing pipeline.

## Highlights

- Canvas-based interactive preview and PNG export through the same compositor.
- Image and text layers with visibility, ordering, opacity, blending, transforms, and effects.
- Move, Hand, and Zoom tools with keyboard shortcuts and direct canvas interaction.
- Undo/redo history with coalescing and jump-to-entry navigation.
- `.mledit.json` project save/open, IndexedDB autosave, and session restore.
- Responsive Photoshop-style spatial-glass workspace.

## Workspace

| Region | Purpose |
|---|---|
| Application bar | Open, save, undo, redo, and export |
| Contextual options bar | Active-tool options, background, and document size |
| Tool rail | Move, Hand, Zoom, layer creation, and panel visibility |
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

## Project Structure

```text
index.html                  Editor shell and browser entry point
src/                        Editor UI, state, panels, export, and orchestration
├── engine/                 Document model, commands, history, tools, and persistence
│   └── compositor.ts       Shared preview/export renderer
└── tools/                  Move, Hand, and Zoom tool implementations
tests/                      UI layout and public documentation contracts
docs/                       Architecture, design, examples, and security guides
```

## Documentation

- [Architecture](docs/architecture.md)
- [Design system](docs/design.md)
- [Composition examples](docs/examples.md)
- [Security review](docs/security-audit.md)

## Data and privacy

Imported media, project autosaves, and exports remain in the browser by default. The Inter font is requested from Google Fonts unless the font imports in `index.html` are changed. See the [security review](docs/security-audit.md) for the current limits and deployment guidance.
