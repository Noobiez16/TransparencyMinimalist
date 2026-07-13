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

test('README exposes only public project guides', () => {
  const readme = readPublicDoc('README.md');
  const privateToolName = new RegExp(['graph', 'ify'].join(''), 'i');
  assert.doesNotMatch(readme, privateToolName);
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
  assert.match(examples, /return to \*\*Transparent\*\* before (?:using \*\*Export\*\*|exporting (?:the )?PNG)/i);
  assert.doesNotMatch(examples, /White.*Black preview backgrounds|Preview transparent work over light and dark backgrounds/i);
  assert.doesNotMatch(examples, /xOffset|yOffset|Twitter\/X.*will reveal|guaranteed/i);
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
  assert.match(security, /crafted (?:`?\.mledit\.json`? )?project/i);
  assert.match(security, /crafted [^\n.]*project[^\n.]*bitmap[^\n.]*remote image request/i);
  assert.match(security, /remote image request[^\n.]*request metadata[^\n.]*privacy/i);
  assert.match(security, /cross-origin[^\n.]*taint[^\n.]*canvas[^\n.]*export/i);
  assert.match(security, /`data:image\/png;base64,/i);
  assert.match(security, /bitmap[^\n.]*size[^\n.]*dimension limits/i);
  assert.match(security, /`img-src 'self' data: blob:`/i);
  assert.doesNotMatch(security, /graph detail|project-derived `innerHTML`|DOM injection|script-execution risk/i);
  assert.doesNotMatch(security, /completely client-side.*No.*external|inherently immune|formal certification/i);
});

test('public docs preserve the architecture diagram without advertising an editor graph', () => {
  for (const path of [
    'README.md',
    'docs/architecture.md',
    'docs/design.md',
    'docs/security-audit.md'
  ]) {
    const text = readPublicDoc(path);
    assert.doesNotMatch(
      text,
      /Document graph|graph overlay|src\/graph-panel\.ts|graph animation|graph detail/i,
      `${path} still describes the removed editor graph`
    );
  }

  const architecture = readPublicDoc('docs/architecture.md');
  assert.match(architecture, /```mermaid/);
});

test('README documents the professional core editing workflow', () => {
  const readme = readPublicDoc('README.md');
  assert.match(readme, /Free Transform/, 'README must name Free Transform');
  assert.match(readme, /Ctrl\+T/, 'README must document the Ctrl+T shortcut');
  assert.match(readme, /\bC\b/, 'README must document the Crop shortcut C');
  assert.match(readme, /\bEnter\b/, 'README must document Enter as apply');
  assert.match(readme, /\bEsc(?:ape)?\b/, 'README must document Escape as cancel');
  assert.match(readme, /\bShift\b/, 'README must document the Shift constrain modifier');
  assert.match(readme, /Ctrl\/Cmd|Ctrl or Cmd/, 'README must document the snap bypass modifier');
  assert.match(readme, /smart (?:alignment )?guides/i, 'README must describe smart guides');
  assert.match(readme, /non-destructive/i, 'README must state the crop is non-destructive');
  assert.match(readme, /[Rr]oadmap/, 'README must carry the explicit future roadmap');
  assert.match(readme, /groups[^\n.]*masks|masks[^\n.]*groups/i, 'roadmap must name groups and masks as future work');
});

test('architecture guide documents version 2 affine documents and the editing engines', () => {
  const architecture = readPublicDoc('docs/architecture.md');
  assert.match(architecture, /version 2/i, 'architecture must describe the version 2 format');
  assert.match(architecture, /version 1[^\n.]*(?:migrat|open|upgrad)/i, 'architecture must explain version 1 compatibility');
  for (const field of ['scaleX', 'scaleY', 'rotation']) {
    assert.match(architecture, new RegExp(`\\b${field}\\b`), `architecture must document the ${field} affine field`);
  }
  for (const module of [
    'src/engine/transform-session.ts',
    'src/engine/snap-engine.ts',
    'src/engine/crop-session.ts'
  ]) {
    assert.match(architecture, new RegExp(module.replaceAll('.', '\\.').replaceAll('/', '\\/')), `architecture must document ${module}`);
  }
  assert.match(architecture, /non-destructive[^\n.]*crop|crop[^\n.]*non-destructive/i);
});

test('examples walk through transform, snapping, and crop usage', () => {
  const examples = readPublicDoc('docs/examples.md');
  assert.match(examples, /Free Transform|Ctrl\+T/, 'examples must exercise Free Transform');
  assert.match(examples, /smart (?:alignment )?guides|snap/i, 'examples must exercise snapping');
  assert.match(examples, /\bCrop\b/, 'examples must exercise the Crop tool');
});

test('all public documents meet global Markdown and terminology rules', () => {
  for (const path of publicFiles) {
    const text = readPublicDoc(path);
    assertProfessionalMarkdown(path, text);
    assert.doesNotMatch(text, /Minimalist Dynamic Layer Image Editor|Canvas Preview|xOffset|yOffset/);
  }
});

test('all repository-relative Markdown links resolve', () => {
  for (const path of publicFiles) {
    const text = readPublicDoc(path);
    const base = dirname(resolve(root, path));
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^(?:https?:|mailto:|#)/.test(href)) continue;
      const target = decodeURIComponent(href.split('#')[0]);
      assert.equal(existsSync(resolve(base, target)), true, `${path} has broken link ${href}`);
    }
  }
});

export { assertProfessionalMarkdown, publicFiles, readPublicDoc, root };
