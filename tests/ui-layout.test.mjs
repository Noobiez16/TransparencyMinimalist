import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'src/style.css'), 'utf8');

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
    'rail-tools', 'rail-add-image', 'rail-add-text', 'rail-graph',
    'rail-layers', 'rail-props', 'btn-add-image', 'btn-add-text',
    'upload-zone', 'file-input', 'layers-list-container',
    'canvas-container', 'canvas-viewport', 'doc-canvas',
    'zoom-out', 'zoom-readout', 'zoom-in', 'bg-color-picker',
    'tab-properties', 'properties-editor-container', 'history-list',
    'graph-overlay', 'graph-canvas'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

export { html, css };
