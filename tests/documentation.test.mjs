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

export { assertProfessionalMarkdown, publicFiles, readPublicDoc, root };
