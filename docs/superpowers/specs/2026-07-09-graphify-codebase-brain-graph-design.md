# Design Spec: Codebase Brain Graph via Graphify

This document outlines the transition from a custom, regex-based import graph generator (`tools/codegraph.py`) to `graphify` (a professional knowledge-graph tool). This will produce a richer, directed interactive visualization, community detection, and a CLI/query interface for future code understanding.

## User Review Required

> [!IMPORTANT]
> The legacy custom script `tools/codegraph.py` and its generated output `docs/architecture-graph.html` will be permanently deleted. They are replaced by the `graphify` CLI and its output directory `graphify-out/` (including `graphify-out/graph.html` and `graphify-out/GRAPH_REPORT.md`).

## Proposed Changes

### Deletions and Cleanup

#### [DELETE] [codegraph.py](file:///c:/Users/vladi/Documents/ProjectsIdeas/TransparencyTW/tools/codegraph.py)
Removes the custom, single-file regex import grapher.

#### [DELETE] [architecture-graph.html](file:///c:/Users/vladi/Documents/ProjectsIdeas/TransparencyTW/docs/architecture-graph.html)
Removes the stale force-directed canvas layout.

---

### Configurations & Documentation

#### [NEW] [.graphifyignore](file:///c:/Users/vladi/Documents/ProjectsIdeas/TransparencyTW/.graphifyignore)
Excludes build files, dependencies, and configuration directories from being analyzed:
```text
node_modules/
dist/
.git/
.superpowers/
.vscode/
package-lock.json
package.json
tsconfig.json
vite.config.ts
docs/
```

#### [NEW] [docs/graphify-guide.md](file:///c:/Users/vladi/Documents/ProjectsIdeas/TransparencyTW/docs/graphify-guide.md)
A professional guide explaining how the graphify tool is structured, how to rebuild/update it, and how to query/explain codebase components using CLI or the interactive HTML visualization.

---

## Verification Plan

### Automated Verification
*   Execute the `graphify` pipeline using the host's Python environment.
*   Verify that `graphify-out/` is populated with `graph.json`, `graph.html`, and `GRAPH_REPORT.md`.
*   Ensure that the generated graph has node counts, community segmentation, and that the health check reports 0 structural issues.

### Manual Verification
*   Open `graphify-out/graph.html` in a web browser to verify interactive rendering and look for community clustering.
*   Run sample CLI queries to verify that `graphify query` runs successfully against the built index.
