import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'src/style.css'), 'utf8');
const topbar = readFileSync(resolve(root, 'src/topbar.ts'), 'utf8');
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
const dom = readFileSync(resolve(root, 'src/dom.ts'), 'utf8');
const canvas = readFileSync(resolve(root, 'src/canvas.ts'), 'utf8');
const optionsBar = readFileSync(resolve(root, 'src/options-bar.ts'), 'utf8');
const propertiesPanel = readFileSync(resolve(root, 'src/properties-panel.ts'), 'utf8');
const tools = readFileSync(resolve(root, 'src/engine/tools.ts'), 'utf8');
const guardPath = resolve(root, 'src/transform-session-guard.ts');
const guard = existsSync(guardPath) ? readFileSync(guardPath, 'utf8') : '';
const rail = readFileSync(resolve(root, 'src/shell/toolbar.ts'), 'utf8');
const layersPanel = readFileSync(resolve(root, 'src/layers-panel.ts'), 'utf8');
const persistence = readFileSync(resolve(root, 'src/engine/persistence.ts'), 'utf8');
const exportSource = readFileSync(resolve(root, 'src/export.ts'), 'utf8');

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
    'dock-stack',
    'statusbar'
  ]) {
    assert.equal(hasClass(html, className), true, `missing .${className}`);
  }
});

test('stack one hosts working Color and Swatches panels', () => {
  const color = readFileSync(resolve(root, 'src/panels/color-panel.ts'), 'utf8');
  const swatches = readFileSync(resolve(root, 'src/panels/swatches-panel.ts'), 'utf8');
  assert.match(color, /setForeground/);
  assert.match(swatches, /transparency\.swatches/);
  assert.match(main, /registerDockPanel\(\{ id: 'color'/);
  assert.match(main, /F6/);
});

test('color chips are wired with D/X commands and text/background application', () => {
  const chipsSrc = readFileSync(resolve(root, 'src/shell/color-chips.ts'), 'utf8');
  assert.match(chipsSrc, /cmdPatchLayer[\s\S]{0,120}?:color/);
  assert.match(chipsSrc, /doc:bgColor/);
  assert.match(main, /['"]D['"]/);
  assert.match(main, /['"]X['"]/);
  assert.match(html, /id=["']color-chips["']/);
});

test('the toolbar renders the manual tool groups with grayed future slots', () => {
  const groups = readFileSync(resolve(root, 'src/shell/toolbar-groups.ts'), 'utf8');
  for (const stub of ['Rectangular Marquee', 'Lasso', 'Eyedropper', 'Brush', 'Pen', 'Horizontal Type', 'Rotate View']) {
    assert.match(groups, new RegExp(stub), `missing stub ${stub}`);
  }
  for (const live of ['move', 'crop', 'hand', 'zoom']) {
    assert.match(groups, new RegExp(`tool:\\s*['"]${live}['"]`), `missing live tool ${live}`);
  }
  assert.match(rail, /guardTransformSession/);
  assert.match(rail, /contextmenu/);
});

test('menu commands cover working actions and phase-labeled stubs', () => {
  for (const id of [
    "'image.canvasSize'", "'layer.newImage'", "'layer.newText'",
    "'layer.delete'", "'view.zoomIn'", "'view.zoomOut'",
    "'view.fit'", "'view.snap'", "'help.about'",
    "'select.all'", "'filter.gaussianBlur'", "'type.rasterize'", "'image.imageSize'"
  ]) {
    assert.match(main, new RegExp(id.replaceAll('.', '\\.')), `missing registration ${id}`);
  }
  assert.match(main, /phase:\s*'C'/);
  assert.match(main, /phase:\s*'D'/);
  assert.match(main, /phase:\s*'E'/);
  assert.match(main, /phase:\s*'F'/);
});

test('the menu bar exposes all eleven Photoshop headings', () => {
  const menu = readFileSync(resolve(root, 'src/shell/menu-bar.ts'), 'utf8');
  for (const title of ['File', 'Edit', 'Image', 'Layer', 'Type', 'Select', 'Filter', 'View', 'Plugins', 'Window', 'Help']) {
    assert.match(menu, new RegExp(`title:\\s*['"]${title}['"]`), `missing ${title} menu`);
  }
  assert.match(html, /id=["']menu-root["']/);
  assert.match(menu, /isTypingTarget/);
});

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

test('all DOM ids remain unique', () => {
  const all = ids(html);
  const duplicates = [...new Set(all.filter((id, index) => all.indexOf(id) !== index))];
  assert.deepEqual(duplicates, []);
});

test('feature-owned ids remain available after the layout move', () => {
  for (const id of [
    'options-host', 'size-chip', 'canvas-width', 'canvas-height',
    'rail-tools', 'toolbar-columns', 'btn-add-image', 'btn-add-text',
    'upload-zone', 'file-input', 'layers-list-container',
    'panel-layers', 'panel-history',
    'canvas-container', 'canvas-viewport', 'doc-canvas',
    'zoom-out', 'zoom-readout', 'zoom-in', 'bg-color-picker',
    'tab-properties', 'properties-editor-container', 'history-list'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  const menuSrc = readFileSync(resolve(root, 'src/shell/menu-bar.ts'), 'utf8');
  for (const legacy of ['btn-open', 'btn-save', 'btn-undo', 'btn-redo', 'btn-export']) {
    assert.match(menuSrc + main, new RegExp(`['"]${legacy}['"]`), `legacy id ${legacy} must be produced by the menu bar`);
  }
});

test('document size status and custom inputs stay synchronized with state', () => {
  assert.match(html, /id=["']status-doc-size["']/);
  assert.match(topbar, /statusSize\.textContent\s*=\s*dimensions/);
  assert.match(topbar, /widthInput\.value\s*=\s*String\(state\.doc\.width\)/);
  assert.match(topbar, /heightInput\.value\s*=\s*String\(state\.doc\.height\)/);
});

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

test('pointer interruption has a distinct cancellation route', () => {
  assert.match(canvas, /addEventListener\(['"]pointercancel['"],\s*cancelPointer\)/);
  assert.match(canvas, /addEventListener\(['"]lostpointercapture['"],\s*cancelPointer\)/);
  assert.doesNotMatch(canvas, /else\s+tool\.onUp\(/);
});

test('Option A exposes contextual affine controls and explicit session actions', () => {
  for (const kind of ['number', 'toggle', 'select', 'action']) {
    assert.match(tools, new RegExp(`['"]${kind}['"]`), `missing ${kind} option kind`);
  }
  assert.match(optionsBar, /aria-pressed/);
  assert.match(optionsBar, /document\.activeElement/);
  assert.match(optionsBar, /data-option-key/);
  assert.match(main, /key\.toLowerCase\(\)\s*===\s*['"]t['"]/);
  assert.match(main, /beginTransform\([^,]+,\s*['"]explicit['"]\)/);
  assert.match(main, /e\.key\s*===\s*['"]Enter['"]/);
  assert.match(main, /e\.key\s*===\s*['"]Escape['"]/);
  assert.match(html, /id=["']status-context["']/);
});

test('Properties uses affine geometry fields instead of uniform scale', () => {
  for (const id of [
    'prop-transform-x', 'prop-transform-y', 'prop-transform-width',
    'prop-transform-height', 'prop-transform-rotation', 'prop-transform-link'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.doesNotMatch(html, /id=["']prop-scale["']/);
  assert.match(propertiesPanel, /layerNaturalSize/);
  assert.match(propertiesPanel, /scaleX/);
  assert.match(propertiesPanel, /scaleY/);
});

test('native SVG icon system covers free-transform workflow', () => {
  for (const key of ['crop', 'rotate', 'link', 'unlink', 'snap', 'apply', 'cancel']) {
    assert.match(dom, new RegExp(`\\b${key}\\s*:`), `missing ${key} SVG icon`);
  }
  assert.doesNotMatch(dom, /<img\b|https?:\/\//);
});

test('one spatial-glass guard owns unresolved explicit-session exits', () => {
  for (const id of ['transform-session-guard', 'transform-session-apply', 'transform-session-cancel']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(css, /\.transform-session-guard/);
  assert.match(css, /\.transform-session-prompt/);
  assert.match(guard, /getTransformSession/);
  assert.match(guard, /applyTransform/);
  assert.match(guard, /cancelTransform/);
  assert.match(guard, /previousFocus/);
  assert.match(guard, /\.inert\s*=\s*true/);
  assert.match(guard, /event\.key\s*===\s*['"]Tab['"]/);
  assert.match(main, /isInteractiveTarget\(t\)/);
  for (const source of [rail, layersPanel, persistence, exportSource]) {
    assert.match(source, /guardTransformSession/);
  }
});

test('compact options wrap while transform decisions stay visible', () => {
  assert.match(css, /@media\s*\(max-width:\s*1023px\)[\s\S]*\.options-host[\s\S]*flex-wrap\s*:\s*wrap/);
  assert.match(css, /\.opt-essential/);
  assert.match(css, /\.transform-session-actions/);
});

test('history navigation is blocked while any editing session is live', () => {
  assert.match(main, /historySessionBlocked/);
  assert.match(main, /isTypingTarget\(t\)\s*\|\|\s*historySessionBlocked\(\)/);
  const sessionStatus = readFileSync(resolve(root, 'src/engine/session-status.ts'), 'utf8');
  assert.match(sessionStatus, /getTransformSession\(\)\)\s*\|\|\s*Boolean\(getCropSession\(\)/);
  const historyPanel = readFileSync(resolve(root, 'src/history-panel.ts'), 'utf8');
  assert.match(historyPanel, /isEditingSessionLive\(\)/);
  const guardSource = readFileSync(resolve(root, 'src/transform-session-guard.ts'), 'utf8');
  assert.match(guardSource, /hasActiveTransformGesture\(\)\)\s*interruptGesture\(\)/);
});

test('Crop tool ships with shortcut C, session lifecycle, and Enter/Escape decisions', () => {
  const crop = readFileSync(resolve(root, 'src/tools/crop.ts'), 'utf8');
  assert.match(crop, /id:\s*['"]crop['"]/);
  assert.match(crop, /shortcut:\s*['"]c['"]/);
  assert.match(crop, /icons\.crop/);
  assert.match(main, /registerTool\(cropTool\)/);
  assert.match(main, /getCropSession\(\)\s*&&\s*e\.key\s*===\s*['"]Enter['"]/);
  assert.match(main, /getCropSession\(\)\s*&&\s*e\.key\s*===\s*['"]Escape['"]/);
  assert.match(main, /cancelCrop\(\)/);
  assert.match(main, /beginCrop\(\)/);
});

test('Crop overlay draws shading, thirds, and constant-size handles', () => {
  const overlay = readFileSync(resolve(root, 'src/canvas-overlay.ts'), 'utf8');
  assert.match(overlay, /evenodd/);
  assert.match(overlay, /step\s*<=\s*2/);
  assert.match(overlay, /hitTestCropOverlay/);
  assert.match(overlay, /HANDLE_SIZE_PX\s*\/\s*scale/);
  assert.match(overlay, /getCropSession/);
});

test('Crop contextual controls expose ratio presets, dimensions, and decisions', () => {
  const crop = readFileSync(resolve(root, 'src/tools/crop.ts'), 'utf8');
  for (const ratio of ['free', 'original', '1:1', '4:5', '16:9', '9:16', 'custom']) {
    assert.match(crop, new RegExp(`['"]${ratio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`), `missing ratio ${ratio}`);
  }
  for (const key of ['crop-width', 'crop-height', 'crop-reset', 'crop-apply', 'crop-cancel']) {
    assert.match(crop, new RegExp(`['"]${key}['"]`), `missing option ${key}`);
  }
  assert.match(crop, /essential:\s*true/);
  assert.match(crop, /applyCrop\(\);\s*setActiveTool\(['"]move['"]\)/);
  assert.match(crop, /cancelCrop\(\);\s*setActiveTool\(['"]move['"]\)/);
});

test('keyboard shortcuts are suppressed only while typing, not on focused buttons', () => {
  const guardSrc = readFileSync(resolve(root, 'src/transform-session-guard.ts'), 'utf8');
  assert.match(guardSrc, /export function isTypingTarget/);
  assert.doesNotMatch(guardSrc, /isTypingTarget[\s\S]{0,200}?'BUTTON'/);
  assert.match(main, /isTypingTarget\(t\)\s*\|\|\s*isTransformSessionGuardOpen\(\)/);
  assert.match(main, /buttonLikeFocused/);
});

test('escape in properties transform fields blurs before syncing so the draft is discarded', () => {
  assert.match(propertiesPanel, /Escape['"]\)\s*\{\s*event\.preventDefault\(\);[\s\S]{0,300}?input\.blur\(\);\s*const layer = getActiveLayer\(\);\s*if \(layer\) syncTransformFields\(layer\);/);
});

test('options row wraps at all widths and pinned actions never overlay siblings', () => {
  assert.match(css, /\.options-host\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.doesNotMatch(css, /\.opt-essential\s*\{[^}]*position:\s*sticky/);
  assert.doesNotMatch(css, /right:\s*70px/);
});

test('the options bar row grows with wrapped content instead of overflowing the workspace', () => {
  assert.match(css, /grid-template-rows:\s*minmax\(44px,\s*auto\)\s*minmax\(44px,\s*auto\)\s*minmax\(0,\s*1fr\)\s*24px/);
  assert.match(css, /\.workspace-settings\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(css, /\.size-chip\s*\{[^}]*white-space:\s*nowrap/);
});

test('zoom snaps to exactly 100% within an epsilon so pan reset is deterministic', () => {
  assert.match(canvas, /Math\.abs\(zoom\s*-\s*1\)\s*<\s*1e-6/);
});

test('zoom publishes a view flag and the options bar re-renders on it', () => {
  const stateSrc = readFileSync(resolve(root, 'src/state.ts'), 'utf8');
  assert.match(stateSrc, /'view'/);
  assert.match(canvas, /notify\('view'\)/);
  assert.match(optionsBar, /dirty\.has\('view'\)/);
});

test('status line shows tool-appropriate hints', () => {
  assert.match(main, /Hand · Drag to pan/);
  assert.match(main, /Zoom · Click to zoom in/);
});

test('custom background color picker toggles the hidden attribute, not inline display', () => {
  assert.match(canvas, /colorPicker\.hidden\s*=\s*bg\s*!==\s*['"]custom['"]/);
  assert.doesNotMatch(canvas, /colorPicker\.style\.display/);
});

export { html, css, topbar, main, dom, canvas };
