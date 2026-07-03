const fs = require('fs');
const path = require('path');

if (process.argv.length < 4) {
  console.error("Usage: node task-brief.cjs <plan_file> <task_number> [out_file]");
  process.exit(1);
}

const planFile = path.resolve(process.argv[2]);
const taskNumber = process.argv[3];
let outFile = process.argv[4];

if (!outFile) {
  const root = path.resolve(__dirname, '../..');
  outFile = path.join(root, '.superpowers', 'sdd', `task-${taskNumber}-brief.md`);
} else {
  outFile = path.resolve(outFile);
}

if (!fs.existsSync(planFile)) {
  console.error(`No such plan file: ${planFile}`);
  process.exit(1);
}

const content = fs.readFileSync(planFile, 'utf8');
const lines = content.split(/\r?\n/);

let infence = false;
let intask = false;
const outputLines = [];

const taskHeaderRegex = new RegExp(`^#+[ \\t]+Task[ \\t]+${taskNumber}([^0-9]|$)`, 'i');
const generalTaskHeaderRegex = /^#+[ \t]+Task[ \t]+[0-9]+/i;

for (const line of lines) {
  if (line.trim().startsWith('```')) {
    infence = !infence;
  }
  
  if (!infence && generalTaskHeaderRegex.test(line)) {
    intask = taskHeaderRegex.test(line);
  }
  
  if (intask) {
    outputLines.push(line);
  }
}

if (outputLines.length === 0) {
  console.error(`Task ${taskNumber} not found in ${planFile}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, outputLines.join('\n'), 'utf8');
console.log(`Wrote ${outFile}: ${outputLines.length} lines`);
