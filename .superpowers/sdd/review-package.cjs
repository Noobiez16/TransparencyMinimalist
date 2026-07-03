const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.argv.length < 4) {
  console.error("Usage: node review-package.cjs <base> <head> [outfile]");
  process.exit(1);
}

const base = process.argv[2];
const head = process.argv[3];
let outFile = process.argv[4];

// Sanitize inputs to prevent shell command injection
const gitRefRegex = /^[a-zA-Z0-9.\-_/@~^]+$/;
if (!gitRefRegex.test(base) || !gitRefRegex.test(head)) {
  console.error("Security Error: Invalid git reference syntax.");
  process.exit(1);
}

try {
  // Verify base and head
  execSync(`git rev-parse --verify --quiet "${base}"`);
  execSync(`git rev-parse --verify --quiet "${head}"`);
} catch (e) {
  console.error(`Invalid git revision: ${base} or ${head}`);
  process.exit(1);
}

const shortBase = execSync(`git rev-parse --short "${base}"`).toString().trim();
const shortHead = execSync(`git rev-parse --short "${head}"`).toString().trim();

if (!outFile) {
  const root = path.resolve(__dirname, '../..');
  outFile = path.join(root, '.superpowers', 'sdd', `review-${shortBase}..${shortHead}.diff`);
} else {
  outFile = path.resolve(outFile);
}

try {
  const commits = execSync(`git log --oneline "${base}..${head}"`).toString();
  const stat = execSync(`git diff --stat "${base}..${head}"`).toString();
  const diff = execSync(`git diff -U10 "${base}..${head}"`).toString();

  const output = [
    `# Review package: ${base}..${head}`,
    '',
    '## Commits',
    commits,
    '',
    '## Files changed',
    stat,
    '',
    '## Diff',
    diff
  ].join('\n');

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, output, 'utf8');

  const commitCount = execSync(`git rev-list --count "${base}..${head}"`).toString().trim();
  console.log(`Wrote ${outFile}: ${commitCount} commit(s), ${output.length} characters`);
} catch (err) {
  console.error("Failed to generate review package:", err.message);
  process.exit(1);
}
