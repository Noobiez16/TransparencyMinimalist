# Graphify Codebase Guide

## Purpose

Graphify is an optional contributor tool for exploring code relationships. It is not required to install, build, test, or run Transparency. The commands below assume `python -m graphify` is already available in the contributor's environment and intentionally do not prescribe an installation method.

## Generated Artifacts

Graphify writes its generated output under `graphify-out/`:

- `graphify-out/graph.html` is the interactive browser visualization.
- `graphify-out/GRAPH_REPORT.md` is a generated structural report that highlights hubs, coupling, and questions for review.
- `graphify-out/graph.json` contains the graph's node and edge data for programmatic use.

Treat these as generated snapshots. Refresh them after relevant source or import changes rather than hand-editing the outputs.

## Generate or Refresh the Graph

From the repository root, generate a directed graph of the current tree:

```powershell
python -m graphify . --directed
```

Run the same command to refresh an existing snapshot. Graphify applies the repository exclusions while scanning, so results focus on maintained source rather than dependencies and generated files.

## Query the Graph

Ask a natural-language question about module relationships:

```powershell
python -m graphify query "How do the canvas tools connect to the compositor?"
```

Find a dependency path between two known node identifiers:

```powershell
python -m graphify path "src_main" "src_engine_compositor"
```

Request an explanation of a node:

```powershell
python -m graphify explain "src_engine_history"
```

Exact node identifiers come from the generated graph, so inspect `graphify-out/graph.html` or `graphify-out/graph.json` before a path or explain query when an identifier is uncertain.

## Read the Results

Use the HTML graph to explore neighborhoods and directionality, the Markdown report to identify areas worth reviewing, and the JSON data when a script or another graph tool needs exact nodes and edges. Graph structure is evidence about static relationships, not proof that a dependency is problematic. Confirm important conclusions against the source and runtime behavior.

## Exclusions and Maintenance

The repository-level [`.graphifyignore`](../.graphifyignore) controls the scan boundary. Current exclusions cover dependencies, build output, configuration files, package metadata, documentation, and Superpowers artifacts. In particular, they omit directories such as `node_modules/`, `dist/`, `.git/`, `.vscode/`, `.superpowers/`, and `docs/`, plus the package lockfile, package manifest, TypeScript configuration, and Vite configuration.

Review the ignore file when the project layout changes. Add only paths that are generated, third-party, administrative, or otherwise outside the graph's intended source boundary.
