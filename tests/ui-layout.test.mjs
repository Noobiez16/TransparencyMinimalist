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
const rail = readFileSync(resolve(root, 'src/rail.ts'), 'utf8');
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
    'rail-tools', 'rail-add-image', 'rail-add-text',
    'rail-layers', 'rail-props', 'btn-add-image', 'btn-add-text',
    'upload-zone', 'file-input', 'layers-list-container',
    'canvas-container', 'canvas-viewport', 'doc-canvas',
    'zoom-out', 'zoom-readout', 'zoom-in', 'bg-color-picker',
    'tab-properties', 'properties-editor-container', 'history-list'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
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
  assert.match(main, /isInteractiveTarget\(t\)\s*\|\|\s*historySessionBlocked\(\)/);
  assert.match(main, /getTransformSession\(\)\)\s*\|\|\s*Boolean\(getCropSession\(\)/);
  assert.match(main, /subscribeTransformSession\(refresh\)/);
  assert.match(main, /subscribeCropSession\(refresh\)/);
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
});

test('custom background color picker toggles the hidden attribute, not inline display', () => {
  assert.match(canvas, /colorPicker\.hidden\s*=\s*bg\s*!==\s*['"]custom['"]/);
  assert.doesNotMatch(canvas, /colorPicker\.style\.display/);
});

export { html, css, topbar, main, dom, canvas };
