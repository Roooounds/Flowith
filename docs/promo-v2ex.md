# V2EX 帖子草稿

> 发布节点：分享发现
> 标签：开源项目 / AI / Rust / React

---

**标题：**

做了个开源桌面工具，用画布编排多个 AI 同时干活——Flowith

**正文：**

各位 V 友好，

分享一个我最近在做的开源项目：[Flowith](https://github.com/Roooounds/Flowith)

简单说就是：**把 AI 变成画布上的节点，连线，运行。** 多个 AI 同时干活，每个节点可以分配不同的角色和模型。

### 为什么做这个

用单个 AI 聊天处理复杂任务（比如写一个完整的游戏设定、审查一份合同）的时候，一个问题就是——你没法让不同的 AI 专家分工协作。而且每次改一个地方，前面的活全部白干。

### 核心功能

- **7 种节点类型**：输入、任务、逻辑判断、决策、分支、循环、输出——拖拽连线就能搭工作流
- **43 个预设角色**：不是那种"你是一个有用的助手"，而是带完整 System Prompt 的专业角色（架构师、编剧、安全审计师……）
- **SHA-256 智能缓存**：改了中间某个节点，只有它和下游重新跑，上游全部保留缓存。这是我用得最多的功能
- **混合模型**：同一个工作流里可以混用本地 Ollama 和云端 API（OpenAI / Claude / Gemini），敏感数据用本地模型跑
- **知识库**：上传文档自动向量化，执行时注入上下文
- **多智能体协作**：支持辩论模式、并行评审、批判优化循环

### 技术栈

桌面壳用的 **Tauri 2 (Rust)**，不是 Electron，打包大概 15MB。前端 React Flow + Zustand，AI 后端 Python FastAPI + LangChain。数据存在本地 SQLite，不需要注册账号，不开网络也能用（配合 Ollama）。

### 系统支持

macOS (Intel + Apple Silicon) / Windows / Linux，Releases 页面有打包好的安装包。

GitHub：https://github.com/Roooounds/Flowith

MIT 协议，随便用。

---

欢迎试用和提 Issue，有什么想法也可以在这里讨论。
