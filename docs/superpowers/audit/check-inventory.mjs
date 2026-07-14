// docs/superpowers/audit/check-inventory.mjs
// Fails (exit 1) if any static interactive control in index.html is missing
// from the control inventory document.
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const inv = readFileSync('docs/superpowers/audit/2026-07-13-control-inventory.md', 'utf8');

const ids = [...html.matchAll(/<(?:button|input|select|textarea)[^>]*\sid=["']([^"']+)["']/g)]
  .map((m) => m[1]);
const missing = [...new Set(ids)].filter((id) => !inv.includes('`#' + id + '`'));

if (missing.length) {
  console.error('MISSING from inventory:', missing.join(', '));
  process.exit(1);
}
console.log(`OK — all ${new Set(ids).size} static interactive ids covered`);
