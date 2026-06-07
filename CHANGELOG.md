# Changelog

## v1.0.3 (2026-06-07)

### Features
- ComfyUI auto-start: app searches multiple paths and launches ComfyUI on startup
- Execution engine caching enhancements and NodePropertiesPanel improvements
- i18n updates

### Fixes
- Resolve 8 clippy warnings (dead_code, too_many_arguments, checked_div, etc.)
- Format Rust code, fix frontend test mock regressions
- Downgrade vitest 4 → 3 to resolve vite@5 module-runner export error

### Docs
- Add badges, LICENSE, CONTRIBUTING.md, issue templates
- Promo copy for community sharing

## v1.0.0 (2026-05-25)

Initial release of Flowith — a node-based multi-agent AI workflow manager.

### Canvas & Engine
- React Flow canvas with 7 node types: Input, Task, Logic, Decision, Switch, Loop, Output
- DAG execution engine with topological sort, SHA-256 input hashing, and downstream cache invalidation
- Soft timeout (120s warning, continues waiting for completion)
- "Apply & Rerun Downstream" — re-execute only from the current node forward

### LLM Integration
- Local: Ollama (any model)
- Cloud: OpenAI, Anthropic, Gemini, Custom API (DeepSeek, etc.)
- Local image gen: ComfyUI
- Mock mode for testing without API keys
- Python backend with LangChain multi-agent collaboration (sequential, parallel, debate, critique)

### Caching & Output
- SHA-256 hash-based execution cache with visual "⚡ Cached" badge on canvas
- Rich media output preview: images, video, code blocks, JSON, file download links
- Auto-detection of output format from free-form agent text

### Undo/Redo
- Snapshot history stacks (50 steps), Ctrl+Z / Ctrl+Shift+Z shortcuts

### Data & Knowledge Base
- SQLite primary storage with localStorage dual-write backup
- Rust-powered Knowledge Base: vector embeddings (Ollama nomic-embed-text), cosine similarity search
- Automatic KB context injection into Task node execution

### UX
- 43 preset AI roles + 5 demo workflows + Welcome modal
- Full i18n: English and Chinese (~280 keys)
- 9-tier structured error types with node visualization
- Inline role assignment popover, auto-centering canvas
- Settings: LLM, Execution, Cache, Logs (with real-time metrics dashboard), General (theme, language)

### Launcher
- System detection + dependency auto-install (Ollama, Python, Git)
- Tutorial carousel during setup
- Smart skip: first-time setup only, subsequent launches go directly to project
- ComfyUI marked as optional (not auto-installed)

### DevOps
- CI: TypeScript check + Vitest + Rust fmt/clippy/test on push/PR
- CD: Cross-platform builds (macOS aarch64/x86_64, Linux AppImage+deb, Windows msi+nsis)
- Structured logging: ring buffer (500 entries), 4 levels, 6 categories, JSON/CSV export
