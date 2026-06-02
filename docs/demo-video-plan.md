# Flowith 演示视频策划方案（增长版）

> **唯一目标**：让观众看完后立刻去下载
> **时长**：2-3 分钟
> **配音**：中文 + 英文字幕
> **平台**：YouTube、Bilibili、Product Hunt、Twitter/X、小红书、LinkedIn

---

## 零、转化策略总览

### 观众看完不下载的三个最大障碍

| 障碍 | 观众心里想的 | 视频里怎么化解 |
|---|---|---|
| "这看起来好复杂" | 我是搞创意的，不是程序员 | 全程零代码，拖拽即用，5 分钟上手 |
| "我可能用不上" | 我的工作没那么复杂 | 给他看 5 个不同行业的真实案例——总有一个像他的工作 |
| "回头再说吧" | 懒得现在下载 | 制造紧迫感 + 降低下载门槛（免费、15MB、一键安装） |

### 转化漏斗设计

```
视频观看 → 记住名字 → 产生"我也想要" → 点击链接 → 下载 → 第一次运行
   ↓           ↓              ↓              ↓           ↓           ↓
  钩子      名字出现3次    看到自己的影子   链接始终在   15MB秒下   自带5个Demo
```

---

## 一、分镜脚本（转化导向）

### 第一幕：结果先行（0:00-0:15）

> **原则**：不要先讲问题。先给观众看"你能得到什么"——制造欲望。

| 时间 | 画面 | 配音 | 字幕（EN） |
|---|---|---|---|
| 0:00-0:05 | **全屏展示最终成果**：一份完整的游戏世界观设定文档，包含世界观描述、角色立绘、对话脚本。精美、专业、让人想要。画面一角小字标注"Made with Flowith"。 | "三天的工作量，五分钟搞定。" | "Three days of work. Done in five minutes." |
| 0:05-0:12 | 画面缩小，露出背后的 Flowith 画布——节点连线、并行执行、全部绿色完成。 | "这不是魔法，是 Flowith。一个免费的桌面工具，让你像指挥乐队一样指挥多个 AI 同时工作。" | "This isn't magic. It's Flowith — a free desktop tool that lets you conduct multiple AIs like an orchestra." |
| 0:12-0:15 | Flowith logo + 标语："Orchestrate AI. Not with code — with a canvas." 底部浮现 GitHub 地址。 | "完全免费，开源。" | "Completely free. Open source." |

### 第二幕：30 秒上手（0:15-0:45）

> **原则**：降低心理门槛——让观众觉得"我也能做到"。

| 时间 | 画面 | 配音 | 字幕（EN） |
|---|---|---|---|
| 0:15-0:25 | **拖拽演示**：从侧边栏拖出 Input 节点 → 输入"赛博朋克武侠世界观" → 拖出三个 Task 节点 → 连线。全程加速但每个动作清晰。鼠标周围有圆形高亮。 | "打开 Flowith，拖几个节点，连几条线。这就建好了一个 AI 工作流。不需要写一行代码。" | "Open Flowith. Drag a few nodes. Connect a few wires. You just built an AI workflow. Zero code." |
| 0:25-0:35 | **分配角色**：点击节点 → 下拉菜单出现 43 个角色 → 选择"世界观构建师"、"角色设计师"、"对白写手"。画面快速切换三个节点分配过程。 | "给每个节点配一个 AI 专家。Flowith 自带 43 个调校好的专业角色——你只需要选，不需要写 prompt。" | "Assign an AI expert to each node. 43 pre-tuned roles included — just pick, no prompt engineering needed." |
| 0:35-0:45 | **点击运行**：Run 按钮特写 → 手指点击 → 节点依次变绿，并行分支同时推进。BGM 到达高点。 | "点一下运行。搞定。" | "Click run. That's it." |

### 第三幕：杀手功能——改一个节点不重跑（0:45-1:10）

> **原则**：这是 Flowith 最强的差异化功能。观众必须记住这一个点。

| 时间 | 画面 | 配音 | 字幕（EN） |
|---|---|---|---|
| 0:45-0:55 | 运行完成后，所有节点绿色。鼠标移到中间一个节点，修改指令。画面上方大字弹出："修改一处需求"。 | "用普通 AI 工具，改一个需求就要全部重来。在 Flowith——" | "With regular AI tools, one change means redoing everything. With Flowith —" |
| 0:55-1:05 | 上游节点保持绿色。被修改的节点和它的下游变灰（pending）。只有这三个节点重新执行。其他节点上方出现"✓ Cached"标记。 | "只有你改的那个节点和它下游的会重新跑。上游的成果全部保留，不浪费一秒算力。" | "Only the node you changed and its downstream re-run. Everything upstream stays cached. Zero wasted compute." |
| 1:05-1:10 | 画面定格在缓存对比：左边"传统方式：全部重跑"，右边"Flowith：只跑变更部分"。SHA-256 图标弹出。 | "SHA-256 智能缓存。这是 Flowith 最核心的竞争力。" | "SHA-256 smart caching. Flowith's killer feature." |

### 第四幕：你的数据你做主（1:10-1:25）

> **原则**：隐私是很多人关心但不好意思问的。主动讲出来。

| 时间 | 画面 | 配音 | 字幕（EN） |
|---|---|---|---|
| 1:10-1:18 | 画面显示一个节点标注"本地 Ollama"运行中，旁边的网络图标打叉。另一个节点标注"云端 Claude"。 | "敏感的工作用本地 Ollama，数据不出电脑。需要顶级推理能力时调用云端模型。混着用，你说了算。" | "Sensitive work stays local with Ollama. Tap cloud models for heavy reasoning. Your data, your rules." |
| 1:18-1:25 | 画面快速展示：项目文件存在本地 SQLite → 没有服务器 → 没有账号 → 不用联网。 | "你的项目、你的数据、你的创意——全都只存在你自己的电脑上。不需要注册账号，不需要联网。" | "Your projects, your data, your ideas — all stored locally. No account. No cloud. No internet required." |

### 第五幕：不止一个场景（1:25-1:45）

> **原则**：让每个人都能看到"这对我有用"。

| 时间 | 画面 | 配音 | 字幕（EN） |
|---|---|---|---|
| 1:25-1:45 | **五连快闪**：五个不同工作流画面，每个 4 秒。画面中央标出行业/角色。 | 不同场景用不同语气： |  |
| | ① 一份带插图的游戏设定集生成中 | "游戏策划——" | "Game designers —" |
| | ② 一篇 SEO 优化的博客文章自动产出 | "内容运营——" | "Content creators —" |
| | ③ 一份带风险标注的合同审查结果 | "法务——" | "Legal teams —" |
| | ④ 一份结构化的学术文献综述 | "研究员——" | "Researchers —" |
| | ⑤ 一份多语言产品发布公告 | "市场——" | "Marketers —" |
| 1:45-1:48 | 五个画面缩小并列，中间浮现："Any workflow. Any industry." | "无论你做什么，Flowith 都能帮你自动化。" | "Whatever you do, Flowith automates it." |

### 第六幕：下载（1:48-2:15）

> **原则**：不要只放一次链接。最后 30 秒全是 CTA。

| 时间 | 画面 | 配音 | 字幕（EN） |
|---|---|---|---|
| 1:48-1:56 | 画面展示下载流程：GitHub Releases 页面 → 下载 DMG → 拖入 Applications → 打开 → Launcher 界面。全程加速 3 倍。每个步骤一个 ✓ 弹出。 | "只有 15MB。macOS、Windows、Linux 全支持。下载、安装、打开——一分钟搞定。" | "Just 15MB. macOS, Windows, Linux. Download, install, launch — one minute." |
| 1:56-2:05 | 画面展示 Launcher 完成检测后，Flowith 主界面打开，内置的 5 个 Demo 工作流在欢迎界面展示。 | "打开就有 5 个 Demo 工作流，照着改就行。完全免费，MIT 开源协议——你可以用它做任何事情，包括商业用途。" | "5 demo workflows pre-loaded. Free forever, MIT license — use it for anything, including commercial work." |
| 2:05-2:15 | **最终帧**：Flowith logo 居中 + "github.com/Roooounds/Flowith" 大字 + "Free · Open Source · 15MB" + 下载二维码（右下角）。背景是画布上所有节点全部绿色的慢动作。BGM 收尾。 | "停止跟 AI 聊天。开始编排它。Flowith，现在就去 GitHub 下载。" | "Stop chatting with AI. Start orchestrating it. Flowith — download now on GitHub." |

---

## 二、转化技巧清单

### 视频中的转化点
- **0:12** — 第一次出现 GitHub 地址（底部浮层）
- **0:35** — "点一下运行。搞定。"（制造"这么简单"的感觉）
- **1:05** — SHA-256 缓存对比画面（制造"这比别的工具强"的认知）
- **1:25** — "Flowith 自动帮你搞定"（暗示省时间）
- **1:48** — 下载流程演示（降低下载的心理阻力）
- **2:05** — 最终 CTA（明确指令："现在就去 GitHub 下载"）
- **2:15** — 静态帧保留至少 5 秒，二维码清晰可见

### 心理触发点
- **即时满足**："五分钟搞定三天的工作"——让他觉得用了就能立刻受益
- **社交证明**："43 个专业角色"、"5 个 Demo 工作流"——不是空壳，内容很丰富
- **零风险**："完全免费"、"MIT 开源"、"不需要注册"——没有心理负担
- **稀缺感**："传统方式全部重来 vs Flowith 只跑变更"——让他觉得不用就吃亏了
- **自我投射**：五个行业闪回——总有一个让他觉得"这说的就是我"

---

## 三、各平台发布策略

### YouTube
- **标题**：`我把 AI 变成了一个创意团队 | Flowith 多智能体工作流`
- **描述第一行**：`⬇️ 下载链接：github.com/Roooounds/Flowith`（不放前面会被折叠）
- **置顶评论**：下载链接 + "有任何问题评论区问我"
- **标签**：Flowith, AI workflow, multi-agent, AI tools, Ollama, open source, productivity
- **缩略图**：左半画布截图（节点绿色），右半大字"FREE AI TEAM"，右下角 logo

### Bilibili
- **标题**：`免费开源！用画布指挥多个AI同时干活，一个人顶一个团队 | Flowith`
- **简介第一行**：GitHub 下载链接
- **标签**：#AI工具 #效率提升 #开源软件 #AI工作流 #Flowith
- **互动引导**："一键三连 + 评论区告诉我你想让 AI 帮你做什么"
- **置顶评论**：下载链接 + 安装教程链接

### Product Hunt
- **Tagline**：`Orchestrate multiple AI agents on a visual canvas — like ComfyUI but for everything`
- **First comment（Maker 故事）**：讲为什么做这个产品（一个人用 AI 聊天太痛苦了）
- **GIF**：60 秒，拖拽→运行→缓存→输出，纯画面+文字，无配音
- **首帧**：必须是 Flowith 画布界面，不能黑屏

### Twitter/X
- **视频**：60 秒竖版，前 3 秒展示运行效果
- **文案**：
  ```
  我做了个免费开源的工具，叫 Flowith。

  把 AI 变成你指挥的团队。拖拽节点，连线，运行。
  多个 AI 同时干活，改一个节点不重跑。

  15MB，本地运行，不上传你的数据。

  github.com/Roooounds/Flowith
  ```
- **配图**：4 张截图——画布全貌、Agent 选择、缓存对比、输出预览

### 小红书
- **视频**：60 秒竖版
- **封面图**：Flowith 画布 + 大字"免费AI团队协作工具"
- **标题**：`一个人+AI团队=一天干完一周的活🔥免费开源`
- **正文**：用"我以为 vs 实际上"的反差结构写
- **评论区**：置顶下载链接，每条评论手动回复引导

### LinkedIn
- **视频**：90 秒版
- **文案**：偏专业，讲产品设计理念和架构
- **第一句**：个人故事——"As a creator, I was tired of..."
- **结尾**：招聘暗示——"We're open source, come contribute"

---

## 四、A/B 测试建议

发布后 48 小时观察数据，如果转化率不理想，换这些变量测试：

| 变量 | 版本 A（当前） | 版本 B（测试） |
|---|---|---|
| 开场 | 展示最终成果 | 展示用户的痛苦（来回切换聊天窗口） |
| 演示案例 | 游戏世界观设计 | 内容营销（SEO 文章生成） |
| CTA 文案 | "现在就去 GitHub 下载" | "免费下载，5 分钟学会" |
| 视频长度 | 2:15 | 1:30（精简版） |
| 缩略图 | 画布 + 文字 | 真人 + 画布叠影 |

---

## 五、配套资源准备

视频发布前需要准备好的东西（这些直接影响转化）：

- [ ] GitHub Releases 页面有最新版本的 DMG/AppImage/MSI
- [ ] README 有清晰的一行安装指令（现在已有）
- [ ] Discord / 微信群 / 讨论区链接（让下载后的人有地方问问题）
- [ ] 一个 2 分钟的"首次使用"快速教程（视频里提到的 5 分钟上手的后续）
- [ ] FAQ：最低配置、是否需要 GPU、支持哪些模型
- [ ] 视频描述区的 UTM 追踪链接（区分各平台来的流量）

---

## 六、录制执行清单

### 准备工作
- [ ] 干净桌面，1920×1080（16:9），隐藏 Dock、菜单栏
- [ ] 提前拉好 2 个本地模型（qwen2.5:7b 够快；一个展示用即可）
- [ ] 提前运行一次 Demo，预热模型，确保不卡顿
- [ ] 关闭所有通知
- [ ] 鼠标光标放大到 150%（系统设置），方便观众追踪
- [ ] 准备英文版 UI（默认设置）

### 录制
- [ ] macOS：OBS（免费，可叠加文字和特效）
- [ ] 录屏帧率 60fps
- [ ] 鼠标点击加涟漪效果（OBS 插件或后期）

### 后期
- [ ] 剪映专业版（免费，支持双语字幕）
- [ ] 配音：剪映内置 AI 配音（中文男声"阳光"）或 ElevenLabs
- [ ] BGM：uptempo electronic / synthwave（YouTube Audio Library 免费）
- [ ] 关键数字弹出动画（15MB、43个角色、SHA-256）
- [ ] 片尾静态帧≥5 秒：logo + GitHub + 二维码
- [ ] 英文字幕校对

### 发布顺序
1. **YouTube + Bilibili** 同一天首发（最大流量池）
2. **Product Hunt** 次日（用 YouTube 视频链接引流）
3. **Twitter/X + 小红书 + LinkedIn** 随后 24 小时内发布（二次传播）
