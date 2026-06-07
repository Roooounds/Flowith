# Flowith 推广文案草稿

> 使用说明：以下文案需要根据发布时的实际情况微调。所有链接、截图占位符在发布前替换为真实内容。
> 发布顺序建议：Reddit → HN（间隔 2-3 天，避免同时被淹没）

---

## 1. Reddit r/LocalLLaMA

**发布类型**：文本帖（Text Post），不要发链接帖——链接帖在该 sub 互动率低

**标题**：

```
I built a node-based AI workflow manager that runs local models via Ollama — drag, connect, run. Only re-runs what changed. (open source, Tauri + React)
```

**正文**：

```
Hey r/LocalLLaMA,

I've been working on something I wanted to share with this community first because you all get the local-first thing.

**Flowith** is a desktop app where you drag AI agents onto a canvas, connect them into a workflow, and hit run. Think ComfyUI, but the nodes are AI agents — each with their own model, system prompt, temperature, and role.

**Why I built it:**
I was tired of chaining AI calls in scripts. One change meant re-running everything. I wanted a visual way to build multi-agent pipelines where only the parts I changed re-execute.

**The local-first angle:**
- Ollama is the default — any model you have pulled works out of the box
- All data stays in SQLite on your machine — no cloud, no account needed
- You can mix local and cloud models in the same workflow (e.g., local Qwen for drafting, Claude for final review)
- Tauri app, ~15MB, won't fight your local models for RAM

**The caching thing:**
Every node gets a SHA-256 hash of its inputs + agent config. If you change node C in the middle of a pipeline, only C and its downstream re-run. Everything upstream stays cached. This is the feature I use the most.

**What's included:**
- 7 node types (Input, Task, Logic, Decision, Switch, Loop, Output)
- 43 preset agent roles (researcher, writer, critic, code reviewer, etc.)
- 5 demo workflows pre-loaded
- Knowledge base — upload docs, they get vectorized and auto-injected into agent context
- Multi-agent modes: sequential, parallel, debate, critique
- Full i18n (English + Chinese)

**Tech stack:** Tauri 2 + React Flow + Zustand + Python FastAPI + LangChain

GitHub: https://github.com/Roooounds/Flowith

It's MIT licensed, macOS/Windows/Linux. Would love feedback from this community — especially on the Ollama integration and the caching approach. Happy to answer any questions.
```

**发布后回复策略**：
- 如果有人问"和 X 有什么区别" → 强调 DAG + 缓存 + 本地优先
- 如果有人问"能不能不用 Ollama" → 可以，支持 OpenAI/Anthropic/Gemini/自定义 API
- 如果有人质疑"为什么不用 n8n/Langflow" → 定位不同，Flowith 是桌面原生、面向个人创作者、不需要部署

---

## 2. Reddit r/selfhosted

**标题**：

```
Flowith — a local-first, open-source AI workflow manager. No cloud, no account, no data leaves your machine. (Tauri desktop app, ~15MB)
```

**正文**：

```
r/selfhosted,

Sharing a project that fits the ethos of this sub: everything runs locally, nothing phones home.

**Flowith** is a node-based desktop app for orchestrating multiple AI agents. You build visual workflows on a canvas — drag nodes, connect them, assign AI roles, hit run.

**The self-hosted pitch:**
- **No server to deploy** — it's a native desktop app (Tauri), not a web service
- **No account required** — no signup, no API key mandatory (works with local Ollama)
- **Data stays local** — projects stored in SQLite on your machine, knowledge base in local vector DB
- **~15MB download** — lighter than most Electron apps
- **Offline capable** — with Ollama running locally, you don't need internet at all

**What it does:**
Build AI workflows visually. Each node is an AI agent with its own model and role. Chain them together — a researcher feeds into a writer feeds into a reviewer. The execution engine handles parallel branches, conditional logic, loops.

The killer feature for me: **smart caching**. Every node is SHA-256 hashed. Change one node? Only that branch re-runs. The rest stays cached. Huge time saver when iterating.

**Models:**
- Local: Ollama (any model — Llama, Mistral, Qwen, DeepSeek...)
- Cloud (optional): OpenAI, Anthropic, Gemini, or any OpenAI-compatible API
- Mix and match in the same workflow

GitHub: https://github.com/Roooounds/Flowith

Cross-platform (macOS/Windows/Linux). MIT licensed. 43 preset agent roles and 5 demo workflows included so you can try it immediately.

Curious what this community thinks — especially about the "no server, just a desktop app" approach.
```

**发布后回复策略**：
- 如果有人问"为什么不做成 web 版" → 桌面原生更轻量，和 Ollama/GPU 共存更友好，不需要 Docker
- 如果有人问"数据怎么备份" → SQLite 文件直接拷贝即可，未来会支持导出

---

## 3. Hacker News — Show HN

**标题**：

```
Show HN: Flowith – node-based multi-agent AI workflow manager with SHA-256 execution caching
```

**正文（HN 用 comment 形式发）**：

```
Hi HN,

I built Flowith — a desktop app for building multi-agent AI workflows visually.

The core idea: each node on the canvas is an AI agent with its own model, system prompt, and role. You connect nodes into a DAG and the execution engine runs them in topological order.

The interesting technical bits:

**SHA-256 execution caching.** Before running a node, we hash its inputs + agent config. If the hash matches the previous run's cache, we skip execution entirely and pass the cached output downstream. When you modify a node mid-pipeline, only that node and its dependents re-execute — everything upstream stays green. This is the feature that makes iterative workflow design actually usable.

**Hybrid compute routing.** Nodes can target different providers — local Ollama for privacy-sensitive tasks, cloud APIs for heavy reasoning. The routing is per-node, not per-workflow, so you can mix models freely.

**DAG engine with soft timeouts.** Topological sort handles parallel branches, conditional logic (Decision/Switch nodes), and loops. We use soft timeouts (120s warning, but keep waiting) rather than hard kills, which matters for large local models.

**Tauri + Rust backend.** The desktop shell is Tauri 2 — ~15MB download, plays well with GPU-heavy local models. The Rust layer manages SQLite persistence, a local vector DB for the knowledge base, and Python service lifecycle.

Tech stack: Tauri 2 (Rust) + React Flow 12 + Zustand + Python FastAPI + LangChain

43 preset agent roles, 5 demo workflows, full i18n (EN + CN). MIT licensed.

GitHub: https://github.com/Roooounds/Flowith

I'd love feedback on the caching approach and the execution engine design. Happy to discuss the architecture.
```

---

## 发布时间规划

| 平台 | 时间 | 原因 |
|---|---|---|
| Reddit r/LocalLLaMA | 周二或周三上午 10am EST | 该 sub 本周中活跃度最高 |
| Reddit r/selfhosted | 间隔 2 天后 | 避免同一天发多个 sub 被判定为 spam |
| Hacker News Show HN | 周二 9-10am EST | HN 流量高峰，Show HN 在此时段曝光率最高 |

## 发布前检查清单

- [ ] GitHub Releases 页面有最新版本可下载
- [ ] README 徽章链接全部有效（CI、Release、Stars）
- [ ] Issue 模板和 PR 模板已就绪
- [ ] CONTRIBUTING.md 已就绪
- [ ] LICENSE 文件已就绪
- [ ] 准备 2-3 张截图（画布全貌、Agent 选择、缓存对比、输出预览）
- [ ] 录制 30-60 秒 GIF demo（拖拽 → 运行 → 缓存 → 输出）
- [ ] 在所有平台统一使用 GitHub 链接：https://github.com/Roooounds/Flowith
