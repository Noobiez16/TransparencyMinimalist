# Transparency Dark Studio Layer Image Editor

A professional-grade browser-based image editor with a dark studio theme and comprehensive layer-editing workflow. Build dynamic layer stacks with an interactive canvas (drag to move layers, zoom controls), adjust effects with real-time CSS filters and transformations, and export high-resolution compositions with pixel-perfect accuracy.

---

## 🚀 Key Features

* **Dynamic Layer Stack**: Layer-based editing supporting multiple image layers and custom styled text overlays. Includes native HTML5 drag-and-drop reordering and click-select to swap Z-indices.
* **Interactive Canvas**: Drag layers directly on the canvas to adjust position, zoom in/out with scroll wheel (Ctrl+scroll), and pan around the viewport for precise positioning.
* **Effect-Stack Properties Panel**: Manage filters (Blur, Contrast, Saturation, Brightness, Invert), transforms (Opacity, Scale, X/Y), and blend modes with real-time live preview.
* **Responsive Live Viewport**: Powered by a highly-optimized in-place DOM updating engine that modifies element attributes directly, ensuring smooth 60fps adjustments even during active slider dragging.
* **Premium Styling Controls**:
  * Aspect ratio presets (1:1 Square, 16:9 Landscape, 9:16 Portrait, 4:5) alongside custom width/height inputs.
  * Canvas background themes (Transparent Checkerboard, Solid White, Solid Black, and Custom Hex Color Picker).
  * Filter controls: Blur, Contrast, Saturation, Brightness, and Invert.
  * Layer transforms: Opacity, Scale, and coordinate X/Y translations.
  * Blend modes: Normal, Multiply, Screen, Overlay, Darken, and Lighten.
* **High-Resolution Canvas Export**: An offscreen rendering engine that pre-loads all images asynchronously to guarantee Z-index fidelity before rendering to a PNG download. Features aspect-ratio-aware font/blur scaling, text newline separation, and center-cover cropping bounds (matching CSS `object-fit: cover`).
* **Input-Safe Event Handling**: Global Ctrl+V paste listens for image uploads but automatically suspends checks when a text input or textarea is active, preventing accidental layer duplication. Focused input guarding prevents annoying cursor resets or focus loss.

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
│   └── style.css            # Dark studio theme variables and viewport styling
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
