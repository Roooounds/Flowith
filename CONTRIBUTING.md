# Contributing to Flowith

Thank you for your interest in contributing to Flowith! This document provides guidelines and steps for contributing.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9.0
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Python](https://www.python.org/) >= 3.10 (for AI backend)
- System dependencies for Tauri — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
# Clone the repository
git clone https://github.com/Roooounds/Flowith.git
cd Flowith

# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev
```

### Optional: Python AI Backend

The Python backend powers multi-agent collaboration features (debate, parallel review, critique). If you only work on the frontend or Rust backend, you can skip this.

```bash
cd backend
pip install -r requirements.txt
python main.py
```

The backend listens on `http://127.0.0.1:8420` by default.

---

## Project Structure

```
Flowith/
  src/               # React + TypeScript frontend
    components/      # UI components (canvas, panels, nodes, common)
    services/        # Business logic (execution engine, LLM, caching, logging)
    stores/          # Zustand state management
    data/            # Preset roles and demo workflows
    i18n/            # Internationalization (EN + CN)
    types/           # TypeScript type definitions
  src-tauri/         # Rust / Tauri backend
    src/             # Rust source (KB engine, service manager, etc.)
  backend/           # Python FastAPI AI layer
    routes/          # API routes
    services/        # LangChain orchestration, multi-agent logic
  docs/              # Documentation
```

---

## Development Workflow

### Branching

- `master` — stable, production-ready. CI runs on every push.
- Feature branches — create from `master`: `feat/your-feature-name`
- Bug fixes — `fix/issue-description`
- Documentation — `docs/what-you-changed`

### Code Style

**TypeScript / React**
- Strict TypeScript — no `any` unless absolutely unavoidable
- Functional components with hooks
- Tailwind CSS for styling — avoid inline styles
- Zustand for state management — no prop drilling beyond 2 levels

**Rust**
- Run `cargo fmt` and `cargo clippy` before committing
- Follow standard Rust naming conventions

**Python**
- Follow PEP 8
- Type hints on all function signatures

### Commit Messages

Use conventional commits:

```
feat: add loop node auto-iteration
fix: correct cache hash for knowledge base changes
docs: update architecture diagram
refactor: extract execution engine into separate module
chore: upgrade React Flow to v12.5
```

### Testing

```bash
# Frontend tests
pnpm test

# Rust tests
cd src-tauri && cargo test

# TypeScript type check
pnpm tsc --noEmit
```

Write tests for:
- Execution engine logic (DAG traversal, caching, hash computation)
- State management (project store mutations, undo/redo)
- LLM service (provider routing, error handling)

---

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/Roooounds/Flowith/issues) to avoid duplicates
2. Open a new issue using the **Bug Report** template
3. Include: steps to reproduce, expected behavior, actual behavior, screenshots if applicable
4. Mention your OS, Flowith version, and Node/Rust/Python versions

### Suggesting Features

1. Open a new issue using the **Feature Request** template
2. Describe the problem you're trying to solve, not just the solution
3. Explain how it fits with Flowith's philosophy (visual, local-first, no-code)

### Submitting Pull Requests

1. Fork the repo and create your branch from `master`
2. Make your changes following the code style guidelines above
3. Add or update tests as needed
4. Ensure all checks pass: `pnpm tsc --noEmit && pnpm test && cd src-tauri && cargo clippy`
5. Write a clear PR description — what changed and why
6. Link the related issue if one exists

### Good First Issues

Look for issues tagged with [`good first issue`](https://github.com/Roooounds/Flowith/labels/good%20first%20issue) — these are scoped to be approachable for new contributors.

Areas where help is especially welcome:
- **i18n**: Add new language translations
- **Preset roles**: Create new specialized agent roles
- **Demo workflows**: Design new example workflows for different industries
- **Documentation**: Improve guides, add screenshots, translate docs
- **Testing**: Increase test coverage

---

## Architecture Notes

### DAG Execution Engine

The execution engine (`src/services/executionEngine.ts`) uses topological sort to determine node execution order. Each node's inputs + agent config are hashed with SHA-256 before execution — if the hash matches the cached result, execution is skipped.

Key rule: when a node is modified, its hash changes, and all downstream nodes are recursively reset to `pending`. Upstream nodes remain `completed` and cached.

### Hybrid LLM Routing

The LLM service (`src/services/llmService.ts`) routes requests based on agent configuration:
- `local_ollama` → `http://localhost:11434`
- `cloud_openai` / `cloud_anthropic` / `cloud_gemini` → respective APIs
- `custom_api` → user-configured endpoint (DeepSeek, etc.)

### State Management

Zustand store (`src/stores/projectStore.ts`) is the single source of truth. All canvas mutations go through the store, which maintains a 50-step undo/redo history via snapshot stacks.

---

## Code of Conduct

Be respectful, constructive, and inclusive. We're all here to build something useful.

## Questions?

Open a [Discussion](https://github.com/Roooounds/Flowith/discussions) or join the community. No question is too small.
