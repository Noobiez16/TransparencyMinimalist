# Codebase Brain Graph Guide (Graphify)

This project has been integrated with **Graphify**, a professional codebase knowledge-graph generator that replaces the legacy custom script `tools/codegraph.py`.

It maps TypeScript module dependencies as a directed force-directed graph, groups them automatically into cohesive communities, and enables interactive web exploration and natural language CLI querying.

---

## Output Files

All graph generation outputs are located in the `graphify-out/` directory:

*   **`graphify-out/graph.html`** - Interactive web visualization of the codebase brain graph (open this directly in your web browser).
*   **`graphify-out/GRAPH_REPORT.md`** - A comprehensive audit report highlighting key codebase hubs ("God Nodes"), surprising coupling across boundaries, and recommended architectural questions.
*   **`graphify-out/graph.json`** - Raw node and edge graph data in GraphRAG-ready format.

---

## How to Rebuild or Update the Graph

If you add new modules or change imports, you can regenerate the graph using the following command from the project root:

```powershell
# Build a directed graph of the current directory
python -m graphify . --directed
```

> [!NOTE]
> Since we ignore third-party packages, configuration, and build folders (like `node_modules/` and `dist/`), the parser will only scan relevant source code in `src/`. Exclusions are controlled via the [.graphifyignore](file:///c:/Users/vladi/Documents/ProjectsIdeas/TransparencyTW/.graphifyignore) file.

---

## How to Query the Codebase

Graphify allows you to ask questions about the codebase structure directly from your terminal.

### 1. Natural Language Queries
Query module interactions, structure, and design flows:
```powershell
python -m graphify query "How does the canvas interaction tools and move tool connect to the main viewport?"
```

### 2. Trace Dependency Paths
Find the shortest path of dependency between two modules or functions:
```powershell
python -m graphify path "src_main" "src_engine_compositor"
```

### 3. Explain Components
Get a clear explanation of any node or interface:
```powershell
python -m graphify explain "src_engine_history"
```
