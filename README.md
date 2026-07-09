# Transparency Dark Studio Layer Image Editor

A professional-grade browser-based image editor with a dark studio theme and comprehensive layer-editing workflow. Build dynamic layer stacks with an interactive canvas (drag to move layers, zoom controls), adjust effects with real-time CSS filters and transformations, and export high-resolution compositions with pixel-perfect accuracy.

---

## 🚀 Key Features

* **Canvas Render Engine**: Single-path compositor with document model, effects processing, and pixel-perfect export parity.
* **Move/Hand/Zoom Tools**: Direct layer manipulation with V/H/Z keyboard shortcuts; Space-hold for hand panning.
* **Undo/Redo + History Panel**: Full command history with coalescing, panel navigation, and truncation on redo.
* **Project Persistence**: Save/open projects as `.mledit.json`; autosave with restore on reload; corrupt file rejection.
* **Document Graph Overlay**: Dependency visualization for layer stack, effects, and transformations (hidden on mobile).
* **Layer Stack Editing**: Reorder layers via drag-and-drop, click-select to change Z-indices, adjust position/scale/opacity/blend modes with live preview.
* **Effect Filters**: Blur, Contrast, Saturation, Brightness, and Invert with real-time rendering.
* **Export**: High-resolution offscreen canvas with aspect-ratio-aware scaling and asynchronous image loading.

---

## 🛠️ Technology Stack

* **Core**: [TypeScript](https://www.typescriptlang.org/) for robust static typing.
* **Build Tool**: [Vite](https://vitejs.dev/) for lightning-fast bundling.
* **Styling**: Vanilla CSS with dark studio theme, custom properties (CSS variables), responsive layout (desktop grid → mobile flex), and smooth micro-animations.
* **Rendering**: Hybrid HTML/CSS for interactive canvas previews and HTML5 Canvas 2D for high-resolution offscreen PNG compilation.

---

## 📁 Project Structure

```
├── index.html               # Main UI editor template (top bar + icon rail + workspace)
├── src/
│   ├── main.ts              # Entry point wiring modules together
│   ├── state.ts             # State + observer/notify system
│   ├── canvas.ts            # Canvas rendering & layer compositing
│   ├── layers-panel.ts      # Layer list UI (add/select/reorder/delete)
│   ├── properties-panel.ts  # Per-layer property controls (transform, blend, effects, text)
│   ├── topbar.ts            # Top bar actions
│   ├── rail.ts              # Icon rail navigation
│   ├── export.ts            # Export engine
│   ├── toast.ts             # Toast notifications
│   ├── dom.ts               # DOM helper utilities
│   ├── style.css            # Dark studio theme variables and viewport styling
│   ├── engine/              # Canvas render engine
│   │   ├── document.ts      # Document model and layer structure
│   │   ├── compositor.ts    # Single-path render engine
│   │   ├── history.ts       # Undo/redo command history
│   │   ├── commands.ts      # Command definitions and execution
│   │   ├── tools.ts         # Tool framework and state
│   │   └── persistence.ts   # Project save/load (.mledit.json)
│   ├── tools/               # Tool implementations
│   │   ├── move.ts          # Move tool (V)
│   │   ├── hand.ts          # Hand/pan tool (H)
│   │   └── zoom.ts          # Zoom tool (Z)
│   ├── graph-panel.ts       # Document graph overlay
│   ├── options-bar.ts       # Tool options display
│   └── history-panel.ts     # Undo/redo history panel
├── dist/                    # Production build output
├── tsconfig.json            # TypeScript compiler configurations
└── vite.config.ts           # Vite bundler parameters
```

---

## 💻 Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation

Clone the repository and install dependencies:

```bash
npm install
```

### Local Development

Launch the hot-reloading development server:

```bash
npm run dev
```

### Production Compilation

Compile and build the production bundle:

```bash
npm run build
```

The compiled assets will be outputted to the `dist/` directory, optimized and ready for static hosting.

---

## 📐 Hybrid Rendering Architecture

To deliver both a high-fidelity experience and desktop performance, the editor leverages a **Hybrid Preview-to-Export** model:

1. **CSS Live Viewport Preview**: As sliders are adjusted, the editor updates the styling properties (`transform`, `filter`, `opacity`, `mix-blend-mode`) on DOM nodes in-place. This offloads the rendering logic directly to the browser's hardware-accelerated compositor.
2. **Canvas 2D Export Engine**: On export, the editor creates a hidden offscreen canvas at the user's defined physical resolutions. It pre-loads all layer images asynchronously using `Promise.all` and then executes a deterministic, synchronous bottom-to-top drawing sequence. This avoids rendering races and ensures filters and Z-indices match the preview exactly.
