import { create } from "zustand";
import type { Project, AgentProfile, TaskNode, WorkflowEdge } from "@/types/project";
import type { BossNode, BossEdge } from "@/types/canvas";
import { v4 as uuidv4 } from "uuid";
import { executeWorkflow } from "@/services/executionEngine";
import { llmService, getLLMConfig } from "@/services/llmService";
import { PRESET_ROLES } from "@/data/presetRoles";
import { matchModel } from "@/services/modelMatcher";
import {
  loadAllProjects,
  saveAllProjects,
  migrateFromLocalStorage,
} from "@/services/databaseService";

// Look up preset role system prompt by Chinese name. Falls back to given string.
function pp(chineseName: string, fallback: string): string {
  return PRESET_ROLES.find(r => r.name === chineseName)?.systemPrompt ?? fallback;
}

// Pick best available model for a category, or use fallback
function pickModel(cat: string, fallback: string, models?: { name: string }[]): string {
  if (!models || models.length === 0) return fallback;
  return matchModel(cat, models) ?? fallback;
}

// ─── Types ────────────────────────────────────────────────────────

type RightPanel = "properties" | "agents" | "kb" | null;

interface WorkflowSnapshot {
  nodes: TaskNode[];
  edges: WorkflowEdge[];
}

const MAX_HISTORY = 50;

interface ProjectStore {
  // Multi-project
  projects: Project[];
  activeProjectId: string | null;
  // Derived from active project
  project: Project | null;
  canvasNodes: BossNode[];
  canvasEdges: BossEdge[];
  selectedNodeId: string | null;
  layoutVersion: number;
  rightPanel: RightPanel;

  // Project actions
  createProject: (name: string, description: string, folderPath?: string) => void;
  importProject: (project: Project) => void;
  loadDemoProject: (lang: "en" | "zh") => void;
  loadDemoCustomerService: (lang: "en" | "zh") => void;
  loadDemoCodeReview: (lang: "en" | "zh") => void;
  loadDemoMarketing: (lang: "en" | "zh") => void;
  loadDemoDataAnalysis: (lang: "en" | "zh") => void;
  loadAllDemos: (lang: "en" | "zh", models?: { name: string }[]) => void;
  bootstrapDemos: (lang: "en" | "zh") => Promise<void>;
  switchProject: (projectId: string) => void;
  removeProject: (projectId: string) => void;
  updateProjectName: (name: string) => void;
  updateProjectGoal: (goal: string) => void;
  updateProjectFolder: (folderPath: string) => void;

  // Agent actions
  addAgent: (agent: Omit<AgentProfile, "agentId" | "createdAt" | "updatedAt">) => void;
  addPresetRoles: (roles: Omit<AgentProfile, "agentId" | "createdAt" | "updatedAt">[]) => void;
  updateAgent: (agentId: string, updates: Partial<AgentProfile>) => void;
  removeAgent: (agentId: string) => void;
  removeVaultAgent: (agentId: string) => void;
  removePresetPermanently: (presetName: string) => void;
  restoreVaultAgent: (agentId: string) => void;

  // Node actions
  addNode: (type: TaskNode["type"], position: { x: number; y: number }) => void;
  updateNode: (nodeId: string, updates: Partial<TaskNode>) => void;
  resizeNode: (nodeId: string, width: number, height: number) => void;
  duplicateNode: (nodeId: string) => void;
  removeNode: (nodeId: string) => void;

  // Edge actions
  addEdge: (source: string, target: string, label?: string, sourceHandle?: string) => void;
  removeEdge: (edgeId: string) => void;

  // Execution
  isRunning: boolean;
  runProgress: { completed: number; total: number };
  runWorkflow: () => Promise<void>;
  runWorkflowFromNode: (nodeId: string) => Promise<void>;

  // Agent editing trigger
  editingAgentId: string | null;
  setEditingAgentId: (agentId: string | null) => void;

  // Role picker auto-open trigger
  rolePickerNodeId: string | null;
  openRolePicker: (nodeId: string | null) => void;

  // Undo / Redo
  past: WorkflowSnapshot[];
  future: WorkflowSnapshot[];
  undo: () => void;
  redo: () => void;

  // Selection / Panel / Layout
  setSelectedNode: (nodeId: string | null) => void;
  setRightPanel: (panel: RightPanel) => void;
  autoLayout: () => void;
  syncCanvasToWorkflow: (nodes: BossNode[], edges: BossEdge[]) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

function taskNodeToBossNode(node: TaskNode, agentNames: string[], agentAvatars: string[], timeoutWarning?: string): BossNode {
  const rfType =
    node.type === "decision" ? "decisionNode"
    : node.type === "switch" ? "switchNode"
    : node.type === "loop" ? "loopNode"
    : node.type === "output" ? "outputNode"
    : "bossNode";
  return {
    id: node.nodeId, type: rfType, position: node.position,
    data: {
      label: node.instruction.slice(0, 40) || node.type,
      nodeType: node.type, agentNames, agentAvatars, agentIds: node.agentIds,
      instruction: node.instruction, status: node.status,
      outputCache: node.outputCache, executionHash: node.executionHash,
      collaborationMode: node.collaborationMode,
      inputSource: node.inputSource, inputPath: node.inputPath, inputContent: node.inputContent,
      outputFormat: node.outputFormat, saved: node.saved, wasCached: node.wasCached, errorDetail: node.errorDetail,
      width: node.width, height: node.height,
      timeoutWarning,
      switchBranches: node.switchBranches,
      loopConfig: node.loopConfig,
    },
  };
}

function getNodeAgents(project: Project, node: TaskNode) {
  const matched = project.agents.filter((a) => node.agentIds.includes(a.agentId));
  return { names: matched.map((a) => a.name), avatars: matched.map((a) => a.avatarEmoji || "👤") };
}

function buildCanvasFromProject(p: Project | null) {
  if (!p) return { canvasNodes: [] as BossNode[], canvasEdges: [] as BossEdge[] };
  const canvasNodes = p.workflow.nodes.map((n) => {
    const { names, avatars } = getNodeAgents(p, n);
    return taskNodeToBossNode(n, names, avatars);
  });
  const canvasEdges: BossEdge[] = p.workflow.edges.map((e) => {
    const sourceNode = p.workflow.nodes.find((n) => n.nodeId === e.sourceNodeId);
    const isDecisionSource = sourceNode?.type === "decision";
    const sourceHandle =
      isDecisionSource && e.label === "Yes" ? "yes"
      : isDecisionSource && e.label === "是" ? "yes"
      : isDecisionSource && e.label === "No" ? "no"
      : isDecisionSource && e.label === "否" ? "no"
      : undefined;
    return {
      id: e.edgeId, source: e.sourceNodeId, target: e.targetNodeId, sourceHandle,
      type: "smoothstep" as const, animated: false,
      style: { stroke: "#4a4f5e", strokeWidth: 2 },
      markerEnd: { type: "arrowclosed" as const, color: "#4a4f5e" },
      label: e.label,
      labelStyle: e.label ? { fill: "#8b8fa3", fontSize: 10 } : undefined,
      labelBgStyle: e.label ? { fill: "#1a1d27" } : undefined,
    };
  });
  return { canvasNodes, canvasEdges };
}

function buildCanvasFromNodes(
  nodes: TaskNode[],
  agents: AgentProfile[],
): { nodes: BossNode[]; edges: BossEdge[] } {
  const agentMap = new Map(agents.map((a) => [a.agentId, a]));
  const canvasNodes = nodes.map((n) => {
    const matched = n.agentIds.map((id) => agentMap.get(id)).filter(Boolean) as AgentProfile[];
    const names = matched.map((a) => a.name);
    const avatars = matched.map((a) => a.avatarEmoji || "👤");
    return taskNodeToBossNode(n, names, avatars);
  });
  // Edges are rebuilt from the workflow snapshot, not from nodes.
  // Caller passes edges separately in undo/redo.
  return { nodes: canvasNodes, edges: [] };
}

function buildCanvasEdges(edges: WorkflowEdge[], nodes: TaskNode[]): BossEdge[] {
  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));
  return edges.map((e) => {
    const sourceNode = nodeMap.get(e.sourceNodeId);
    const isDecisionSource = sourceNode?.type === "decision";
    const sourceHandle =
      isDecisionSource && e.label === "Yes" ? "yes"
      : isDecisionSource && e.label === "是" ? "yes"
      : isDecisionSource && e.label === "No" ? "no"
      : isDecisionSource && e.label === "否" ? "no"
      : undefined;
    return {
      id: e.edgeId, source: e.sourceNodeId, target: e.targetNodeId, sourceHandle,
      type: "smoothstep" as const, animated: false,
      style: { stroke: "#4a4f5e", strokeWidth: 2 },
      markerEnd: { type: "arrowclosed" as const, color: "#4a4f5e" },
      label: e.label,
      labelStyle: e.label ? { fill: "#8b8fa3", fontSize: 10 } : undefined,
      labelBgStyle: e.label ? { fill: "#1a1d27" } : undefined,
    };
  });
}

function captureSnapshot(): WorkflowSnapshot | null {
  const { project } = useProjectStore.getState();
  if (!project) return null;
  return {
    nodes: project.workflow.nodes.map((n) => ({ ...n })),
    edges: project.workflow.edges.map((e) => ({ ...e })),
  };
}

function pushHistory(set: any, get: any) {
  const snap = captureSnapshot();
  if (snap) {
    set({ past: [...get().past, snap].slice(-MAX_HISTORY), future: [] });
  }
}

function updateProjectInState(
  projects: Project[],
  activeId: string | null,
  updater: (p: Project) => Project,
) {
  const idx = projects.findIndex((p) => p.projectId === activeId);
  if (idx === -1) return projects;
  const updated = [...projects];
  updated[idx] = { ...updater(updated[idx]), updatedAt: new Date().toISOString() };
  return updated;
}

// ─── Persistence ──────────────────────────────────────────────────

// Fallback loader for when SQLite is unavailable (standalone / test mode)
function loadProjectsFallback(): { projects: Project[]; activeProjectId: string | null } {
  try {
    const raw = localStorage.getItem("flowith_projects");
    if (raw) {
      const data = JSON.parse(raw);
      if (data.projects && Array.isArray(data.projects)) {
        return { projects: data.projects, activeProjectId: data.activeProjectId ?? null };
      }
    }
  } catch {}
  return { projects: [], activeProjectId: null };
}

// Save to SQLite (primary) + localStorage (backup)
async function saveProjects(projects: Project[], activeProjectId: string | null) {
  // Primary: SQLite
  try {
    await saveAllProjects(projects, activeProjectId);
  } catch (e) {
    console.warn("[Store] SQLite save failed, using localStorage fallback:", e);
  }
  // Fallback: localStorage (always written for safety)
  try {
    localStorage.setItem(
      "flowith_projects",
      JSON.stringify({ projects, activeProjectId })
    );
  } catch {}
}

// ─── Demo Builders (pure data, no set()) ──────────────────────────

function buildGameStorylineDemo(lang: "en" | "zh", models?: { name: string }[]) {
  const projectId = uuidv4();
  const now = new Date().toISOString();
  const isZh = lang === "zh";
  const pick = (cat: string, fb: string) => pickModel(cat, fb, models);

  const agents: AgentProfile[] = [
    { agentId: uuidv4(), name: isZh ? "剧情分析师" : "Story Analyst", avatarEmoji: "📖", category: "分析", provider: "local_ollama", modelName: pick("分析", "qwen2.5:14b"), systemPrompt: isZh ? `你是一位专注于叙事内容的剧情分析师。你的核心任务是：从原始游戏设计文档、世界观设定或散乱的创意笔记中，系统性地提取结构化叙事要素。

【分析框架】
1. 主题提取：识别设计文档中明示和暗示的核心主题（如「牺牲与救赎」「秩序与自由的冲突」），标注每条主题在原文中的证据
2. 母题识别：找出反复出现的意象、象征和叙事模式（如「破碎的镜子」「三次考验」），分析它们在叙事中的功能和演变
3. 叙事支柱提炼：总结 3-5 条支撑整个故事的叙事支柱，每条支柱说明它如何串联主要情节线和角色发展
4. 世界观规则：提取世界运行的内部逻辑（魔法如何运作、社会如何组织、有哪些禁忌），标注不一致之处

【输出格式】
- 主题地图（1 页）：各主题之间的关系图和简要说明
- 母题索引：每个母题的首次出现、高潮和最终消解
- 叙事支柱文档（核心交付物）：每条支柱的详细论证和对应的设计原文引用
- 风险提示：标注叙事中的潜在矛盾（如角色行为违背其设定动机的情节点）` : `You are a story analyst who systematically extracts structured narrative elements from design documents and creative notes. Follow this framework: (1) Theme Extraction — identify explicit and implicit themes with textual evidence; (2) Motif Recognition — map recurring symbols and narrative patterns across the work; (3) Narrative Pillars — distill 3-5 supporting pillars with their role in connecting plot and character development; (4) World Rules — extract internal logic and flag inconsistencies. Output: theme map, motif index, narrative pillars document (core deliverable), and risk notes for potential contradictions.`, temperature: 0.3, toolsAllowed: ["file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "角色设计师" : "Character Designer", avatarEmoji: "🎭", category: "设计", provider: "local_ollama", modelName: pick("设计", "llama3.2:3b"), systemPrompt: isZh ? `你是一位专精游戏和小说角色创造的角色设计师。你设计的不是功能性的 NPC，而是拥有独立欲望、恐惧和成长弧线的「活人」。

【角色构建设计流程】
1. 外部层：姓名、年龄、外貌特征、社会身份、职业/阶层。在游戏世界观中选择具有文化逻辑的设计
2. 心理层：核心欲望（角色想要什么）、深层需求（角色真正需要什么——通常与欲望不同）、性格缺陷（阻碍他们获得成长的特质）、核心价值观（什么情况下角色会打破自己的规则）
3. 关系层：与至少 3 个其他角色的关系动态（盟友/对手/导师/爱人/背叛者），标注每段关系的起点状态和预期演变方向
4. 叙事功能层：这个角色在主线和支线中承担什么叙事功能？（英雄/导师/守门人/变形者/阴影/骗徒/使者）
5. 成长弧线：角色从故事开始到结束发生了什么变化？如果没有变化，为什么？（扁平弧线需要同样有力的理由）

【设计铁律】
- 每个角色必须有独特的说话方式——词汇量、句式偏好、口头禅。读者应该能从对白认出是谁在说话
- 反派不能只是「邪恶」——他们必须是自己故事中的英雄，有自洽的逻辑和值得同情的一面
- 避免功能性角色：如果一个角色只为了提供信息或任务而存在，重新设计直到他们有自己的目标` : `You create deep characters for games and fiction. Design process: (1) External — name, age, appearance, social role in the world's logic; (2) Psychological — core desire vs. true need, character flaw, core values; (3) Relational — dynamics with 3+ other characters with starting state and expected evolution; (4) Narrative function — what role does this character serve (hero/mentor/shapeshifter/trickster etc.); (5) Growth arc — how does the character change? Every character needs a distinct voice recognizable from dialogue alone. Antagonists must be the hero of their own story with self-consistent logic. Avoid functional characters who exist only to deliver information.`, temperature: 0.7, toolsAllowed: ["web_search", "file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "剧情架构师" : "Plot Architect", avatarEmoji: "🏗️", category: "产品", provider: "local_ollama", modelName: pick("产品", "deepseek-r1:8b"), systemPrompt: isZh ? `你是一位专精叙事结构设计的剧情架构师。你的设计从目标体验反推结构——先确认「观众/玩家在故事的每一阶段应该感受到什么」，再倒推需要什么样的情节设计来制造那些情绪。

【剧情架构流程】
1. 体验地图：定义观众情绪曲线——在哪一刻感到好奇、紧张、悲伤、振奋、震惊？标注每个情绪拐点和对应的情节点
2. 三幕/五幕结构设计：
   - 第一幕（设定）：建立常态世界 → 激励事件打破常态 → 主角做出不可回头的选择
   - 第二幕（对抗）：递进式障碍（每个障碍比前一个更难且揭示新的信息）→ 中点转折（虚假胜利或虚假失败）→ 最黑暗时刻
   - 第三幕（解决）：高潮对决（主角用学到的教训对抗最终障碍）→ 新的平衡
3. 子情节编织：B 故事（通常是关系线）和 C 故事（通常是主题线）如何与 A 故事交织？标注每个子情节的独立弧线
4. 关键决策点设计：主角在哪些节点做出两难选择？每个选择如何同时推进情节和角色成长？

【节奏控制】
- 标注每个场景的叙事功能（推进情节/揭示信息/深化角色/建立氛围/制造紧张），确保功能多样性
- 高强度场景后必须有「呼吸空间」（处理情感后果的安静场景），否则观众会情感疲劳
- 伏笔和回报表：每个埋下的伏笔标注在哪一章回收，确保没有遗忘的线索` : `You design compelling plot structures. Process: (1) Experience Map — define the audience emotional curve and key inflection points; (2) Three/Five-Act design with progressive obstacles, midpoint reversal, and darkest moment; (3) Subplot weaving — B-story (relationship) and C-story (theme) arcs and their intersection with A-story; (4) Decision point design — binary choices that advance both plot and character growth. Every scene gets a narrative function tag (advance plot/reveal info/deepen character/build atmosphere/create tension). High-intensity scenes must be followed by breathing room. Maintain a setup-payoff table to track every planted clue.`, temperature: 0.5, toolsAllowed: ["web_search"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "资深编辑" : "Senior Editor", avatarEmoji: "📝", category: "审核", provider: "local_ollama", modelName: pick("审核", "llama3.2:3b"), systemPrompt: pp("主编辑", isZh ? `你是一位深度编辑，负责对叙事内容的最终质量把关。

【审校方法】
1. 结构诊断：通读全文后回答——核心主题是否清晰贯穿？是否有偏离主线的冗余章节？情节因果链是否有断裂？
2. 角色一致性：每个角色的行为是否符合其设定动机？角色声音（对白风格）是否前后统一？角色弧线是否完整且有说服力？
3. 节奏审校：逐章标注张力曲线——是否有无效的平淡段落？高潮是否被过早或过晚释放？章节结尾是否有钩子推动读者继续？
4. 语言精炼：逐段删减冗余形容词和副词、合并不必要的短段落、将告知改为展示、确保叙述视角一致
5. 整体评估：给出修改优先级排序——致命问题（叙事逻辑矛盾）、重要问题（节奏失衡、角色不一致）、打磨建议（语言优化）

【返稿标准】
- 每次返稿附带修改摘要，说明做了哪些结构性改动及原因
- 区分「必须改」（事实/逻辑错误）和「建议改」（表达优化，可讨论）` : `You perform final quality review for narrative content. Process: (1) Structure — does the core theme thread through? Any redundant chapters? Plot causality breaks? (2) Character consistency — do actions match motivations? Is each voice distinct and consistent? (3) Pacing — map tension curve per chapter, flag dead zones and premature climaxes; (4) Language — cut redundancy, merge fragments, ensure consistent narrative POV; (5) Final assessment with priority: fatal (logic breaks), major (pacing/consistency), polish (language). Always provide a change summary explaining structural edits.`), temperature: 0.2, toolsAllowed: ["file_read", "file_write"], createdAt: now, updatedAt: now },
  ];

  const n1 = uuidv4(), n2 = uuidv4(), n3 = uuidv4(), n4 = uuidv4(), n5 = uuidv4(), n6 = uuidv4(), n7 = uuidv4(), n8 = uuidv4();

  const nodes: TaskNode[] = isZh ? [
    { nodeId: n1, type: "input", agentIds: [], instruction: "📚 游戏设计文档：设定在一个濒死世界中的奇幻RPG。黑暗氛围、道德灰色抉择、三大阵营：光明骑士团、暗影议会、自然守护者。", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 180 }, data: {} },
    { nodeId: n2, type: "task", agentIds: [agents[0].agentId], instruction: "从设计文档中提取核心主题和叙事支柱", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 340 }, data: {} },
    { nodeId: n3, type: "task", agentIds: [agents[1].agentId], instruction: "设计8个主要角色，包含背景故事、动机和关系网", status: "pending", outputCache: null, executionHash: null, position: { x: 80, y: 520 }, data: {} },
    { nodeId: n4, type: "task", agentIds: [agents[2].agentId, agents[0].agentId], instruction: "规划三幕式主线剧情弧，标注关键决策点", status: "pending", outputCache: null, executionHash: null, position: { x: 520, y: 520 }, data: {} },
    { nodeId: n5, type: "decision", agentIds: [agents[0].agentId, agents[3].agentId], instruction: "角色与剧情一致性是否通过验证？", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 700 }, data: {} },
    { nodeId: n6, type: "task", agentIds: [agents[3].agentId, agents[0].agentId], instruction: "撰写第一幕（12章）的详细章节摘要", status: "pending", outputCache: null, executionHash: null, position: { x: 140, y: 880 }, data: {} },
    { nodeId: n7, type: "task", agentIds: [agents[3].agentId], instruction: "最终润色：校对全部摘要，确保各章语气一致", status: "pending", outputCache: null, executionHash: null, position: { x: 460, y: 880 }, data: {} },
    { nodeId: n8, type: "output", agentIds: [], instruction: "🎨 最终成品：游戏宣传海报", status: "pending", outputCache: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", executionHash: null, position: { x: 300, y: 1060 }, data: {} },
  ] : [
    { nodeId: n1, type: "input", agentIds: [], instruction: "📚 Game Design Document: Fantasy RPG set in a dying world. Dark atmosphere, morally gray choices, 3 major factions: Knights of Light, Shadow Council, Nature Wardens.", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 180 }, data: {} },
    { nodeId: n2, type: "task", agentIds: [agents[0].agentId], instruction: "Extract core themes and narrative pillars from the design document", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 340 }, data: {} },
    { nodeId: n3, type: "task", agentIds: [agents[1].agentId], instruction: "Design 8 main characters with backstories, motivations, and relationship webs", status: "pending", outputCache: null, executionHash: null, position: { x: 80, y: 520 }, data: {} },
    { nodeId: n4, type: "task", agentIds: [agents[2].agentId, agents[0].agentId], instruction: "Outline the 3-act main plot arc with key decision points", status: "pending", outputCache: null, executionHash: null, position: { x: 520, y: 520 }, data: {} },
    { nodeId: n5, type: "decision", agentIds: [agents[0].agentId, agents[3].agentId], instruction: "Is character-plot consistency validated?", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 700 }, data: {} },
    { nodeId: n6, type: "task", agentIds: [agents[3].agentId, agents[0].agentId], instruction: "Write detailed chapter-by-chapter summaries for Act 1 (12 chapters)", status: "pending", outputCache: null, executionHash: null, position: { x: 140, y: 880 }, data: {} },
    { nodeId: n7, type: "task", agentIds: [agents[3].agentId], instruction: "Final polish: proofread all summaries, ensure tone consistency across chapters", status: "pending", outputCache: null, executionHash: null, position: { x: 460, y: 880 }, data: {} },
    { nodeId: n8, type: "output", agentIds: [], instruction: "🎨 Final Output: Game Promo Poster", status: "pending", outputCache: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", executionHash: null, position: { x: 300, y: 1060 }, data: {} },
  ];

  const edges: WorkflowEdge[] = [
    { edgeId: uuidv4(), sourceNodeId: n1, targetNodeId: n2 },
    { edgeId: uuidv4(), sourceNodeId: n2, targetNodeId: n3, label: isZh ? "主题" : "themes" },
    { edgeId: uuidv4(), sourceNodeId: n2, targetNodeId: n4, label: isZh ? "支柱" : "pillars" },
    { edgeId: uuidv4(), sourceNodeId: n3, targetNodeId: n5 },
    { edgeId: uuidv4(), sourceNodeId: n4, targetNodeId: n5 },
    { edgeId: uuidv4(), sourceNodeId: n5, targetNodeId: n6, label: isZh ? "是" : "Yes" },
    { edgeId: uuidv4(), sourceNodeId: n5, targetNodeId: n7, label: isZh ? "否" : "No" },
    { edgeId: uuidv4(), sourceNodeId: n6, targetNodeId: n8 },
    { edgeId: uuidv4(), sourceNodeId: n7, targetNodeId: n8 },
  ];

  const project: Project = {
    projectId, name: isZh ? "🎮 游戏剧情开发" : "🎮 Game Storyline Development",
    description: isZh ? "演示：多智能体协作的RPG叙事设计工作流" : "Demo: Multi-agent workflow for RPG narrative design",
    goal: isZh ? "开发一款暗黑奇幻RPG游戏的完整剧情设定。" : "Develop the complete storyline for a dark fantasy RPG.",
    knowledgeBaseId: null, workflow: { nodes, edges }, agents, vaultAgents: [], permanentlyDeletedPresetNames: [],
    createdAt: now, updatedAt: now,
  };

  const { canvasNodes, canvasEdges } = buildCanvasFromProject(project);
  return { project, canvasNodes, canvasEdges };
}

function buildCustomerServiceDemo(lang: "en" | "zh", models?: { name: string }[]) {
  const projectId = uuidv4();
  const now = new Date().toISOString();
  const isZh = lang === "zh";
  const pick = (cat: string, fb: string) => pickModel(cat, fb, models);

  const agents: AgentProfile[] = [
    { agentId: uuidv4(), name: isZh ? "意图分类器" : "Intent Classifier", avatarEmoji: "🏷️", category: "客服", provider: "local_ollama", modelName: pick("客服", "hermes3:8b"), systemPrompt: pp("意图分类器", "Classify customer messages into categories: billing, technical, account, complaint, general. Output ONLY the category name in lowercase."), temperature: 0.1, toolsAllowed: [], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "账单客服" : "Billing Agent", avatarEmoji: "💳", category: "客服", provider: "local_ollama", modelName: pick("客服", "hermes3:8b"), systemPrompt: pp("账单客服", "Handle billing inquiries professionally. Acknowledge the specific charge, explain clearly, state actions, set expectations."), temperature: 0.4, toolsAllowed: ["file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "技术支持" : "Tech Support", avatarEmoji: "🛠️", category: "客服", provider: "local_ollama", modelName: pick("客服", "hermes3:8b"), systemPrompt: pp("技术支持", "Provide technical troubleshooting. Gather environment info, identify root cause, provide numbered steps, verify the fix."), temperature: 0.2, toolsAllowed: ["web_search"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "通用客服" : "General CS", avatarEmoji: "💬", category: "客服", provider: "local_ollama", modelName: pick("客服", "hermes3:8b"), systemPrompt: pp("通用客服", "Handle general inquiries warmly. Confirm understanding, answer directly, route specialists when needed."), temperature: 0.5, toolsAllowed: ["web_search"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "客服质检员" : "QA Reviewer", avatarEmoji: "🔎", category: "客服", provider: "local_ollama", modelName: pick("客服", "hermes3:8b"), systemPrompt: pp("客服质检员", "Evaluate service interactions on accuracy, empathy, efficiency, policy adherence, and tone. Score 1-5 with evidence."), temperature: 0.2, toolsAllowed: ["file_read"], createdAt: now, updatedAt: now },
  ];

  const n1 = uuidv4(), n2 = uuidv4(), n3 = uuidv4(), n4 = uuidv4(), n5 = uuidv4(), n6 = uuidv4(), n7 = uuidv4(), n8 = uuidv4();

  const nodes: TaskNode[] = [
    { nodeId: n1, type: "input", agentIds: [], instruction: isZh ? "📩 客户消息：'我被多收了三笔费用，每笔 \$29.99。我需要立即退款。'" : "📩 Customer message: 'I've been overcharged 3 times, \$29.99 each. I need a refund NOW.'", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 100 }, data: {} },
    { nodeId: n2, type: "task", agentIds: [agents[0].agentId], instruction: isZh ? "分析客户意图并分类" : "Analyze customer intent and classify", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 260 }, data: {} },
    { nodeId: n3, type: "switch", agentIds: [agents[0].agentId], instruction: isZh ? "根据分类结果路由" : "Route based on classification", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 420 }, switchBranches: ["billing", "technical", "general", "complaint"], data: {} },
    { nodeId: n4, type: "task", agentIds: [agents[1].agentId], instruction: isZh ? "处理账单投诉：核查交易记录，计算退款金额，撰写专业回复" : "Handle billing: verify transactions, calculate refund, draft response", status: "pending", outputCache: null, executionHash: null, position: { x: 60, y: 580 }, data: {} },
    { nodeId: n5, type: "task", agentIds: [agents[3].agentId], instruction: isZh ? "处理通用咨询" : "Handle general inquiry", status: "pending", outputCache: null, executionHash: null, position: { x: 540, y: 580 }, data: {} },
    { nodeId: n6, type: "logic", agentIds: [], instruction: isZh ? "汇总所有回复" : "Merge all responses", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 740 }, data: {} },
    { nodeId: n7, type: "task", agentIds: [agents[4].agentId], instruction: isZh ? "质检审核：检查回复是否准确、专业、共情" : "QA review: verify accuracy, professionalism, empathy", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 900 }, data: {} },
    { nodeId: n8, type: "output", agentIds: [], instruction: isZh ? "✅ 最终客服回复" : "✅ Final CS Response", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 1060 }, data: {} },
  ];

  const edges: WorkflowEdge[] = [
    { edgeId: uuidv4(), sourceNodeId: n1, targetNodeId: n2 },
    { edgeId: uuidv4(), sourceNodeId: n2, targetNodeId: n3 },
    { edgeId: uuidv4(), sourceNodeId: n3, targetNodeId: n4, label: "billing" },
    { edgeId: uuidv4(), sourceNodeId: n3, targetNodeId: n5, label: "general" },
    { edgeId: uuidv4(), sourceNodeId: n4, targetNodeId: n6 },
    { edgeId: uuidv4(), sourceNodeId: n5, targetNodeId: n6 },
    { edgeId: uuidv4(), sourceNodeId: n6, targetNodeId: n7 },
    { edgeId: uuidv4(), sourceNodeId: n7, targetNodeId: n8 },
  ];

  const project: Project = {
    projectId, name: isZh ? "💬 客服智能分流" : "💬 Customer Service Router",
    description: isZh ? "演示：Switch多分支路由 + 质检审核闭环" : "Demo: Multi-branch Switch routing + QA review loop",
    goal: isZh ? "构建智能客服分流系统。" : "Build an intelligent CS routing system.",
    knowledgeBaseId: null, workflow: { nodes, edges }, agents, vaultAgents: [], permanentlyDeletedPresetNames: [],
    createdAt: now, updatedAt: now,
  };

  const { canvasNodes, canvasEdges } = buildCanvasFromProject(project);
  return { project, canvasNodes, canvasEdges };
}

function buildCodeReviewDemo(lang: "en" | "zh", models?: { name: string }[]) {
  const projectId = uuidv4();
  const now = new Date().toISOString();
  const isZh = lang === "zh";
  const pick = (cat: string, fb: string) => pickModel(cat, fb, models);

  const agents: AgentProfile[] = [
    { agentId: uuidv4(), name: isZh ? "安全审计员" : "Security Auditor", avatarEmoji: "🔐", category: "审核", provider: "local_ollama", modelName: pick("审核", "hermes3:8b"), systemPrompt: pp("安全审计员", "Audit code for security vulnerabilities covering OWASP Top 10. Score each finding by CVSS, provide reproduction steps and concrete fix."), temperature: 0.2, toolsAllowed: ["code_execution", "file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "代码风格审查员" : "Style Reviewer", avatarEmoji: "🎨", category: "开发", provider: "local_ollama", modelName: pick("开发", "hermes3:8b"), systemPrompt: pp("代码风格审查员", "Review code for naming, single-responsibility, nesting depth, magic numbers, and DRY violations. Rate each issue as nits/suggestion/must-fix."), temperature: 0.2, toolsAllowed: ["code_execution", "file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "性能分析师" : "Performance Analyst", avatarEmoji: "⚡", category: "开发", provider: "local_ollama", modelName: pick("开发", "hermes3:8b"), systemPrompt: pp("性能分析师", "Analyze performance bottlenecks. Establish baseline first, then check DB queries, algorithms, network, and frontend rendering. Never optimize without measurement."), temperature: 0.3, toolsAllowed: ["code_execution", "file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "技术主管" : "Tech Lead", avatarEmoji: "👔", category: "开发", provider: "local_ollama", modelName: pick("开发", "hermes3:8b"), systemPrompt: pp("技术主管", "Make final approval decisions using four dimensions: correctness, maintainability, risk, and cost. Output APPROVED/REQUEST CHANGES/DISCUSS with specific reasoning."), temperature: 0.3, toolsAllowed: ["code_execution", "file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "高级前端工程师" : "Sr Frontend Dev", avatarEmoji: "⚛️", category: "开发", provider: "local_ollama", modelName: pick("开发", "hermes3:8b"), systemPrompt: pp("高级前端工程师", "Fix frontend issues. Read existing code first, design component interfaces before implementation, cover loading/empty/error states, check a11y and responsive breakpoints."), temperature: 0.3, toolsAllowed: ["code_execution", "file_read", "file_write"], createdAt: now, updatedAt: now },
  ];

  const n1 = uuidv4(), n2 = uuidv4(), n3 = uuidv4(), n4 = uuidv4(), n5 = uuidv4(), n6 = uuidv4(), n7 = uuidv4(), n8 = uuidv4(), n9 = uuidv4();

  const nodes: TaskNode[] = [
    { nodeId: n1, type: "input", agentIds: [], instruction: isZh ? "🔗 PR #142: 重构用户认证模块。文件: auth.ts, session.ts, middleware.ts" : "🔗 PR #142: Refactor auth module. Files: auth.ts, session.ts, middleware.ts", status: "pending", outputCache: null, executionHash: null, position: { x: 400, y: 80 }, data: {} },
    { nodeId: n2, type: "task", agentIds: [agents[0].agentId], instruction: isZh ? "安全审计：检查认证流程中的漏洞" : "Security audit: scan auth flow for vulnerabilities", status: "pending", outputCache: null, executionHash: null, position: { x: 100, y: 240 }, data: {} },
    { nodeId: n3, type: "task", agentIds: [agents[1].agentId], instruction: isZh ? "代码风格审查：检查命名、结构" : "Style review: check naming, structure", status: "pending", outputCache: null, executionHash: null, position: { x: 400, y: 240 }, data: {} },
    { nodeId: n4, type: "task", agentIds: [agents[2].agentId], instruction: isZh ? "性能分析：检测 N+1 查询、内存泄漏" : "Performance analysis: N+1 queries, memory issues", status: "pending", outputCache: null, executionHash: null, position: { x: 700, y: 240 }, data: {} },
    { nodeId: n5, type: "logic", agentIds: [], instruction: isZh ? "合并三项审查结果" : "Merge all three review results", status: "pending", outputCache: null, executionHash: null, position: { x: 400, y: 400 }, data: {} },
    { nodeId: n6, type: "decision", agentIds: [agents[3].agentId], instruction: isZh ? "是否有严重问题需要修复？" : "Are there critical issues?", status: "pending", outputCache: null, executionHash: null, position: { x: 400, y: 560 }, data: {} },
    { nodeId: n7, type: "task", agentIds: [agents[4].agentId], instruction: isZh ? "根据审查意见修复代码" : "Fix code based on review findings", status: "pending", outputCache: null, executionHash: null, position: { x: 200, y: 720 }, data: {} },
    { nodeId: n8, type: "decision", agentIds: [agents[3].agentId], instruction: isZh ? "修复后是否通过复查？" : "Does the fix pass re-review?", status: "pending", outputCache: null, executionHash: null, position: { x: 400, y: 880 }, data: {} },
    { nodeId: n9, type: "output", agentIds: [], instruction: isZh ? "✅ 审查报告" : "✅ Review Report", status: "pending", outputCache: null, executionHash: null, position: { x: 400, y: 1040 }, data: {} },
  ];

  const edges: WorkflowEdge[] = [
    { edgeId: uuidv4(), sourceNodeId: n1, targetNodeId: n2 },
    { edgeId: uuidv4(), sourceNodeId: n1, targetNodeId: n3 },
    { edgeId: uuidv4(), sourceNodeId: n1, targetNodeId: n4 },
    { edgeId: uuidv4(), sourceNodeId: n2, targetNodeId: n5 },
    { edgeId: uuidv4(), sourceNodeId: n3, targetNodeId: n5 },
    { edgeId: uuidv4(), sourceNodeId: n4, targetNodeId: n5 },
    { edgeId: uuidv4(), sourceNodeId: n5, targetNodeId: n6 },
    { edgeId: uuidv4(), sourceNodeId: n6, targetNodeId: n7, label: isZh ? "是" : "Yes" },
    { edgeId: uuidv4(), sourceNodeId: n6, targetNodeId: n9, label: isZh ? "否" : "No" },
    { edgeId: uuidv4(), sourceNodeId: n7, targetNodeId: n8 },
    { edgeId: uuidv4(), sourceNodeId: n8, targetNodeId: n9, label: isZh ? "是" : "Yes" },
  ];

  const project: Project = {
    projectId, name: isZh ? "🔐 代码审查流水线" : "🔐 Code Review Pipeline",
    description: isZh ? "演示：三路并行审查 + 双层决策 + 修复闭环" : "Demo: 3-way parallel review + double decision gates + fix loop",
    goal: isZh ? "建立自动化代码审查流水线。" : "Automated code review pipeline.",
    knowledgeBaseId: null, workflow: { nodes, edges }, agents, vaultAgents: [], permanentlyDeletedPresetNames: [],
    createdAt: now, updatedAt: now,
  };

  const { canvasNodes, canvasEdges } = buildCanvasFromProject(project);
  return { project, canvasNodes, canvasEdges };
}

function buildMarketingDemo(lang: "en" | "zh", models?: { name: string }[]) {
  const projectId = uuidv4();
  const now = new Date().toISOString();
  const isZh = lang === "zh";
  const pick = (cat: string, fb: string) => pickModel(cat, fb, models);

  const agents: AgentProfile[] = [
    { agentId: uuidv4(), name: isZh ? "市场研究员" : "Market Researcher", avatarEmoji: "🔍", category: "分析", provider: "local_ollama", modelName: pick("分析", "hermes3:8b"), systemPrompt: pp("市场研究员", "Research market trends using PESTLE and Porter's Five Forces. Build competitor matrices by function/pricing/audience/market share. Cite sources and dates."), temperature: 0.5, toolsAllowed: ["web_search", "file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "资深文案" : "Copywriter", avatarEmoji: "✍️", category: "文案", provider: "local_ollama", modelName: pick("文案", "hermes3:8b"), systemPrompt: pp("资深文案", "Write brand copy. Confirm brand tone, audience, and channel first. Provide 2-3 creative directions with scenario notes. Every sentence must carry information or emotion."), temperature: 0.7, toolsAllowed: ["web_search"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "社媒运营" : "Social Media Manager", avatarEmoji: "📱", category: "文案", provider: "local_ollama", modelName: pick("文案", "hermes3:8b"), systemPrompt: pp("社媒运营", "Craft platform-specific content for Twitter/LinkedIn/Instagram/Xiaohongshu. Adapt tone per platform. Include hashtag strategy and posting time recommendations."), temperature: 0.8, toolsAllowed: ["web_search"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "品牌策略师" : "Brand Strategist", avatarEmoji: "🎯", category: "产品", provider: "local_ollama", modelName: pick("产品", "hermes3:8b"), systemPrompt: pp("品牌策略师", "Ensure brand alignment. Check every piece against the brand positioning statement. Identify competitor positioning gaps. Define brand personality archetype and tone boundaries."), temperature: 0.6, toolsAllowed: ["web_search", "file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "主编辑" : "Senior Editor", avatarEmoji: "📝", category: "审核", provider: "local_ollama", modelName: pick("审核", "hermes3:8b"), systemPrompt: pp("主编辑", "Review content for structure, facts, language, and style consistency. Mark changes as must-fix/suggestion/preference. Let the author's voice shine through."), temperature: 0.2, toolsAllowed: ["file_read", "file_write"], createdAt: now, updatedAt: now },
  ];

  const n1 = uuidv4(), n2 = uuidv4(), n3 = uuidv4(), n4 = uuidv4(), n5 = uuidv4(), n6 = uuidv4(), n7 = uuidv4(), n8 = uuidv4(), n9 = uuidv4();

  const nodes: TaskNode[] = [
    { nodeId: n1, type: "input", agentIds: [], instruction: isZh ? "🎯 产品：EcoGlow 可持续护肤品牌。目标受众：25-35岁女性。新品：植物基精华液。" : "🎯 Product: EcoGlow sustainable skincare. Audience: women 25-35. Launch: plant-based serum.", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 60 }, data: {} },
    { nodeId: n2, type: "task", agentIds: [agents[0].agentId], instruction: isZh ? "市场调研：分析竞品、目标受众和定位机会" : "Market research: competitors, audience, positioning", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 220 }, data: {} },
    { nodeId: n3, type: "task", agentIds: [agents[1].agentId], instruction: isZh ? "创作广告语和品牌口号（5-8条）" : "Create ad slogans and taglines (5-8 options)", status: "pending", outputCache: null, executionHash: null, position: { x: 100, y: 380 }, data: {} },
    { nodeId: n4, type: "task", agentIds: [agents[2].agentId], instruction: isZh ? "创作社媒内容：3条IG + 2条LinkedIn + 1条TikTok" : "Create social content: 3 IG + 2 LinkedIn + 1 TikTok", status: "pending", outputCache: null, executionHash: null, position: { x: 500, y: 380 }, data: {} },
    { nodeId: n5, type: "logic", agentIds: [], instruction: isZh ? "汇总所有营销物料" : "Merge all marketing assets", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 540 }, data: {} },
    { nodeId: n6, type: "task", agentIds: [agents[3].agentId], instruction: isZh ? "品牌一致性审核" : "Brand consistency audit", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 700 }, data: {} },
    { nodeId: n7, type: "decision", agentIds: [agents[3].agentId, agents[4].agentId], instruction: isZh ? "所有内容是否通过品牌审核？" : "Does all content pass brand review?", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 860 }, data: {} },
    { nodeId: n8, type: "task", agentIds: [agents[4].agentId], instruction: isZh ? "根据反馈修改不合格物料" : "Revise flagged content per feedback", status: "pending", outputCache: null, executionHash: null, position: { x: 140, y: 1020 }, data: {} },
    { nodeId: n9, type: "output", agentIds: [], instruction: isZh ? "📦 营销物料包" : "📦 Marketing Asset Pack", status: "pending", outputCache: null, executionHash: null, position: { x: 460, y: 1020 }, data: {} },
  ];

  const edges: WorkflowEdge[] = [
    { edgeId: uuidv4(), sourceNodeId: n1, targetNodeId: n2 },
    { edgeId: uuidv4(), sourceNodeId: n2, targetNodeId: n3 },
    { edgeId: uuidv4(), sourceNodeId: n2, targetNodeId: n4 },
    { edgeId: uuidv4(), sourceNodeId: n3, targetNodeId: n5 },
    { edgeId: uuidv4(), sourceNodeId: n4, targetNodeId: n5 },
    { edgeId: uuidv4(), sourceNodeId: n5, targetNodeId: n6 },
    { edgeId: uuidv4(), sourceNodeId: n6, targetNodeId: n7 },
    { edgeId: uuidv4(), sourceNodeId: n7, targetNodeId: n8, label: isZh ? "否" : "No" },
    { edgeId: uuidv4(), sourceNodeId: n7, targetNodeId: n9, label: isZh ? "是" : "Yes" },
    { edgeId: uuidv4(), sourceNodeId: n8, targetNodeId: n9 },
  ];

  const project: Project = {
    projectId, name: isZh ? "📢 营销活动全案" : "📢 Marketing Campaign Builder",
    description: isZh ? "演示：并行创作 + 汇总审核 + 修改迭代" : "Demo: Parallel creation + merge review + revision loop",
    goal: isZh ? "为新品发布生成完整营销物料包。" : "Generate a complete marketing asset pack.",
    knowledgeBaseId: null, workflow: { nodes, edges }, agents, vaultAgents: [], permanentlyDeletedPresetNames: [],
    createdAt: now, updatedAt: now,
  };

  const { canvasNodes, canvasEdges } = buildCanvasFromProject(project);
  return { project, canvasNodes, canvasEdges };
}

function buildDataAnalysisDemo(lang: "en" | "zh", models?: { name: string }[]) {
  const projectId = uuidv4();
  const now = new Date().toISOString();
  const isZh = lang === "zh";
  const pick = (cat: string, fb: string) => pickModel(cat, fb, models);

  const agents: AgentProfile[] = [
    { agentId: uuidv4(), name: isZh ? "数据工程师" : "Data Engineer", avatarEmoji: "🔄", category: "分析", provider: "local_ollama", modelName: pick("分析", "hermes3:8b"), systemPrompt: pp("数据工程师", "Clean and transform raw data. Follow ETL: explore (rows, types, missing rates) -> clean (document strategy per column) -> transform (normalize, join, aggregate) -> validate (row counts, key metric reconciliation)."), temperature: 0.2, toolsAllowed: ["code_execution", "file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "数据分析师" : "Data Analyst", avatarEmoji: "📊", category: "分析", provider: "local_ollama", modelName: pick("分析", "hermes3:8b"), systemPrompt: pp("数据分析师", "Perform statistical analysis. Check data quality first, then EDA, hypothesis testing (report p-values and effect sizes), conclude with one core finding + 3 supporting points + 1 action recommendation. Never confuse correlation with causation."), temperature: 0.3, toolsAllowed: ["code_execution", "web_search"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "BI分析师" : "BI Analyst", avatarEmoji: "📈", category: "分析", provider: "local_ollama", modelName: pick("分析", "hermes3:8b"), systemPrompt: pp("BI分析师", "Create dashboards and visualizations. One dashboard answers one business question. Title every chart with a conclusion, not a label. Maximize data-ink ratio."), temperature: 0.4, toolsAllowed: ["code_execution", "file_read"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "战略顾问" : "Strategy Consultant", avatarEmoji: "🧭", category: "分析", provider: "local_ollama", modelName: pick("分析", "hermes3:8b"), systemPrompt: pp("战略顾问", "Synthesize findings into strategy. Structure: current diagnosis -> opportunity identification -> 2-3 option evaluation -> recommended action with first step. Lead with conclusions. Be honest about uncertainty."), temperature: 0.5, toolsAllowed: ["file_read", "web_search"], createdAt: now, updatedAt: now },
    { agentId: uuidv4(), name: isZh ? "金融分析师" : "Financial Analyst", avatarEmoji: "💰", category: "分析", provider: "local_ollama", modelName: pick("分析", "hermes3:8b"), systemPrompt: pp("金融分析师", "Validate numbers and assess business impact. Check financial statement linkages, ratio trends vs. industry, and flag anomalies (non-recurring items, related transactions, policy changes). Each model must list key assumptions with sensitivity ranges."), temperature: 0.3, toolsAllowed: ["web_search", "file_read"], createdAt: now, updatedAt: now },
  ];

  const n1 = uuidv4(), n2 = uuidv4(), n3 = uuidv4(), n4 = uuidv4(), n5 = uuidv4(), n6 = uuidv4(), n7 = uuidv4(), n8 = uuidv4(), n9 = uuidv4();

  const nodes: TaskNode[] = [
    { nodeId: n1, type: "input", agentIds: [], instruction: isZh ? "📊 原始销售数据 Q1-Q3 2025。字段：日期、产品、地区、销售额、数量、客户类型。" : "📊 Raw sales data Q1-Q3 2025. Fields: date, product, region, revenue, quantity, customer_type.", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 60 }, data: {} },
    { nodeId: n2, type: "task", agentIds: [agents[0].agentId], instruction: isZh ? "数据清洗：处理缺失值、异常值、类型转换" : "Data cleaning: handle nulls, outliers, type conversions", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 220 }, data: {} },
    { nodeId: n3, type: "task", agentIds: [agents[1].agentId], instruction: isZh ? "统计分析：趋势、分布、相关性、同比/环比增长" : "Statistical analysis: trends, distributions, correlations, YoY/QoQ", status: "pending", outputCache: null, executionHash: null, position: { x: 100, y: 380 }, data: {} },
    { nodeId: n4, type: "task", agentIds: [agents[1].agentId], instruction: isZh ? "异常检测：识别异常交易模式" : "Anomaly detection: identify unusual patterns", status: "pending", outputCache: null, executionHash: null, position: { x: 500, y: 380 }, data: {} },
    { nodeId: n5, type: "logic", agentIds: [], instruction: isZh ? "合并分析结果" : "Merge analysis results", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 540 }, data: {} },
    { nodeId: n6, type: "task", agentIds: [agents[2].agentId], instruction: isZh ? "数据可视化建议" : "Visualization: recommend chart types", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 700 }, data: {} },
    { nodeId: n7, type: "task", agentIds: [agents[3].agentId], instruction: isZh ? "撰写执行摘要：将数据洞察转化为业务建议" : "Executive summary: insights to recommendations", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 860 }, data: {} },
    { nodeId: n8, type: "decision", agentIds: [agents[4].agentId], instruction: isZh ? "数据置信度和财务数据是否可靠？" : "Is data confidence sufficient?", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 1020 }, data: {} },
    { nodeId: n9, type: "output", agentIds: [], instruction: isZh ? "📋 完整分析报告" : "📋 Full Report + Recommendations", status: "pending", outputCache: null, executionHash: null, position: { x: 300, y: 1180 }, data: {} },
  ];

  const edges: WorkflowEdge[] = [
    { edgeId: uuidv4(), sourceNodeId: n1, targetNodeId: n2 },
    { edgeId: uuidv4(), sourceNodeId: n2, targetNodeId: n3 },
    { edgeId: uuidv4(), sourceNodeId: n2, targetNodeId: n4 },
    { edgeId: uuidv4(), sourceNodeId: n3, targetNodeId: n5 },
    { edgeId: uuidv4(), sourceNodeId: n4, targetNodeId: n5 },
    { edgeId: uuidv4(), sourceNodeId: n5, targetNodeId: n6 },
    { edgeId: uuidv4(), sourceNodeId: n6, targetNodeId: n7 },
    { edgeId: uuidv4(), sourceNodeId: n7, targetNodeId: n8 },
    { edgeId: uuidv4(), sourceNodeId: n8, targetNodeId: n9, label: isZh ? "是" : "Yes" },
  ];

  const project: Project = {
    projectId, name: isZh ? "📊 数据分析与高管报告" : "📊 Data Analysis & Executive Report",
    description: isZh ? "演示：数据清洗 → 并行分析 → 可视化 → 执行摘要 → 置信度门控" : "Demo: Clean → parallel analysis → viz → exec summary → confidence gate",
    goal: isZh ? "从原始数据到高管可用的分析报告。" : "Transform raw data into an executive-ready report.",
    knowledgeBaseId: null, workflow: { nodes, edges }, agents, vaultAgents: [], permanentlyDeletedPresetNames: [],
    createdAt: now, updatedAt: now,
  };

  const { canvasNodes, canvasEdges } = buildCanvasFromProject(project);
  return { project, canvasNodes, canvasEdges };
}

// ─── Store ────────────────────────────────────────────────────────

// Helper: clean up migrated data (remove goal nodes, fill defaults)
function sanitizeProjects(projects: Project[]) {
  for (const p of projects) {
    if (p.workflow?.nodes) {
      p.workflow.nodes = p.workflow.nodes.filter((n: any) => n.type !== "goal");
      p.workflow.edges = (p.workflow.edges || []).filter(
        (e: any) => p.workflow.nodes.some((n: any) => n.nodeId === e.sourceNodeId) && p.workflow.nodes.some((n: any) => n.nodeId === e.targetNodeId)
      );
    }
    if (!p.goal) p.goal = "";
    if (!p.vaultAgents) p.vaultAgents = [];
    if (!p.permanentlyDeletedPresetNames) p.permanentlyDeletedPresetNames = [];
  }
}

// Sync load from localStorage (blocking — needed for initial render)
const saved = loadProjectsFallback();
sanitizeProjects(saved.projects);
const { projects: savedProjects, activeProjectId: savedActiveId } = saved;
const activeProject = savedProjects.find((p) => p.projectId === savedActiveId) ?? null;
const initialCanvas = buildCanvasFromProject(activeProject);

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: savedProjects,
  activeProjectId: savedActiveId,
  project: activeProject,
  canvasNodes: initialCanvas.canvasNodes,
  canvasEdges: initialCanvas.canvasEdges,
  selectedNodeId: null,
  layoutVersion: 0,
  rightPanel: null,
  rolePickerNodeId: null,
  isRunning: false,
  runProgress: { completed: 0, total: 0 },
  editingAgentId: null,
  past: [],
  future: [],

  // ── Project CRUD ──────────────────────────────────────────────

  createProject: (name, description, folderPath) => {
    const project: Project = {
      projectId: uuidv4(), name, description, goal: "", folderPath, knowledgeBaseId: null,
      workflow: { nodes: [], edges: [] }, agents: [], vaultAgents: [], permanentlyDeletedPresetNames: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    set({
      projects: [...get().projects, project],
      activeProjectId: project.projectId,
      project,
      canvasNodes: [], canvasEdges: [],
      selectedNodeId: null, rightPanel: null,
    });
  },

  importProject: (project) => {
    // Backward compat: ensure vault fields exist
    const normalized: Project = {
      ...project,
      vaultAgents: project.vaultAgents || [],
      permanentlyDeletedPresetNames: project.permanentlyDeletedPresetNames || [],
    };
    const { canvasNodes, canvasEdges } = buildCanvasFromProject(normalized);
    set({
      projects: [...get().projects, normalized],
      activeProjectId: normalized.projectId,
      project: normalized,
      canvasNodes, canvasEdges,
      selectedNodeId: null, rightPanel: null,
    });
  },

  switchProject: (projectId) => {
    const p = get().projects.find((pr) => pr.projectId === projectId) ?? null;
    const { canvasNodes, canvasEdges } = buildCanvasFromProject(p);
    set({ activeProjectId: projectId, project: p, canvasNodes, canvasEdges, selectedNodeId: null, rightPanel: null });
  },

  removeProject: (projectId) => {
    const { projects, activeProjectId } = get();
    const remaining = projects.filter((p) => p.projectId !== projectId);
    if (remaining.length === 0) {
      set({ projects: [], activeProjectId: null, project: null, canvasNodes: [], canvasEdges: [], selectedNodeId: null, rightPanel: null });
      return;
    }
    const newActive = activeProjectId === projectId ? remaining[0] : remaining.find((p) => p.projectId === activeProjectId) ?? remaining[0];
    const { canvasNodes, canvasEdges } = buildCanvasFromProject(newActive);
    set({ projects: remaining, activeProjectId: newActive.projectId, project: newActive, canvasNodes, canvasEdges, selectedNodeId: null, rightPanel: null });
  },

  updateProjectName: (name) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const updated = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, name }));
    set({ projects: updated, project: { ...project, name, updatedAt: new Date().toISOString() } });
  },

  updateProjectGoal: (goal) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const updated = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, goal }));
    set({ projects: updated, project: { ...project, goal, updatedAt: new Date().toISOString() } });
  },

  updateProjectFolder: (folderPath) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const updated = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, folderPath }));
    set({ projects: updated, project: { ...project, folderPath, updatedAt: new Date().toISOString() } });
  },

  loadDemoProject: (lang) => {
    const data = buildGameStorylineDemo(lang);
    set({ projects: [...get().projects, data.project], activeProjectId: data.project.projectId, project: data.project, canvasNodes: data.canvasNodes, canvasEdges: data.canvasEdges, selectedNodeId: null, rightPanel: null });
  },

  // ── Demo 2: 客服分流 ───────────────────────────────────────────
  loadDemoCustomerService: (lang) => {
    const data = buildCustomerServiceDemo(lang);
    set({ projects: [...get().projects, data.project], activeProjectId: data.project.projectId, project: data.project, canvasNodes: data.canvasNodes, canvasEdges: data.canvasEdges, selectedNodeId: null, rightPanel: null });
  },

  // ── Demo 3: 代码审查 ───────────────────────────────────────────
  loadDemoCodeReview: (lang) => {
    const data = buildCodeReviewDemo(lang);
    set({ projects: [...get().projects, data.project], activeProjectId: data.project.projectId, project: data.project, canvasNodes: data.canvasNodes, canvasEdges: data.canvasEdges, selectedNodeId: null, rightPanel: null });
  },

  // ── Demo 4: 营销全案 ───────────────────────────────────────────
  loadDemoMarketing: (lang) => {
    const data = buildMarketingDemo(lang);
    set({ projects: [...get().projects, data.project], activeProjectId: data.project.projectId, project: data.project, canvasNodes: data.canvasNodes, canvasEdges: data.canvasEdges, selectedNodeId: null, rightPanel: null });
  },

  // ── Demo 5: 数据分析 ───────────────────────────────────────────
  loadDemoDataAnalysis: (lang) => {
    const data = buildDataAnalysisDemo(lang);
    set({ projects: [...get().projects, data.project], activeProjectId: data.project.projectId, project: data.project, canvasNodes: data.canvasNodes, canvasEdges: data.canvasEdges, selectedNodeId: null, rightPanel: null });
  },

  loadAllDemos: (lang, models) => {
    const demos = [
      buildGameStorylineDemo(lang, models),
      buildCustomerServiceDemo(lang, models),
      buildCodeReviewDemo(lang, models),
      buildMarketingDemo(lang, models),
      buildDataAnalysisDemo(lang, models),
    ];
    const existing = get().projects;
    const first = demos[0];
    set({
      projects: [...existing, ...demos.map((d) => d.project)],
      activeProjectId: first.project.projectId,
      project: first.project,
      canvasNodes: first.canvasNodes,
      canvasEdges: first.canvasEdges,
      selectedNodeId: null,
      rightPanel: null,
    });
  },

  bootstrapDemos: async (lang) => {
    let models: { name: string }[] | undefined;
    try {
      const cfg = getLLMConfig();
      const res = await fetch(`${cfg.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        models = (data.models ?? []).map((m: any) => ({ name: m.name ?? m.model ?? "" }));
      }
    } catch { /* use hardcoded defaults */ }
    get().loadAllDemos(lang, models);
  },

  // ── Agents ────────────────────────────────────────────────────

  addAgent: (agent) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const newAgent: AgentProfile = { ...agent, agentId: uuidv4(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const updated = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, agents: [...p.agents, newAgent] }));
    set({ projects: updated, project: { ...project, agents: [...project.agents, newAgent], updatedAt: new Date().toISOString() } });
  },

  addPresetRoles: (roles) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const now = new Date().toISOString();
    const newAgents: AgentProfile[] = roles.map((r) => ({ ...r, agentId: uuidv4(), createdAt: now, updatedAt: now }));
    const updated = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, agents: [...p.agents, ...newAgents] }));
    set({ projects: updated, project: { ...project, agents: [...project.agents, ...newAgents], updatedAt: now } });
  },

  updateAgent: (agentId, updates) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const updated = updateProjectInState(projects, activeProjectId, (p) => ({
      ...p, agents: p.agents.map((a) => a.agentId === agentId ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a),
    }));
    const newAgents = project.agents.map((a) => a.agentId === agentId ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a);
    set({ projects: updated, project: { ...project, agents: newAgents, updatedAt: new Date().toISOString() } });
  },

  removeAgent: (agentId) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const removed = project.agents.find((a) => a.agentId === agentId);
    const remaining = project.agents.filter((a) => a.agentId !== agentId);
    const vault = removed ? [...project.vaultAgents, removed] : project.vaultAgents;
    const updated = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, agents: remaining, vaultAgents: vault }));
    set({ projects: updated, project: { ...project, agents: remaining, vaultAgents: vault, updatedAt: new Date().toISOString() } });
  },

  removeVaultAgent: (agentId) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const vault = project.vaultAgents.filter((a) => a.agentId !== agentId);
    const updated = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, vaultAgents: vault }));
    set({ projects: updated, project: { ...project, vaultAgents: vault, updatedAt: new Date().toISOString() } });
  },

  removePresetPermanently: (presetName) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const names = [...project.permanentlyDeletedPresetNames, presetName];
    const updated = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, permanentlyDeletedPresetNames: names }));
    set({ projects: updated, project: { ...project, permanentlyDeletedPresetNames: names, updatedAt: new Date().toISOString() } });
  },

  restoreVaultAgent: (agentId) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const restored = project.vaultAgents.find((a) => a.agentId === agentId);
    if (!restored) return;
    const vault = project.vaultAgents.filter((a) => a.agentId !== agentId);
    const agents = [...project.agents, restored];
    const updated = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, agents, vaultAgents: vault }));
    set({ projects: updated, project: { ...project, agents, vaultAgents: vault, updatedAt: new Date().toISOString() } });
  },

  // ── Nodes ─────────────────────────────────────────────────────

  addNode: (type, position) => {
    pushHistory(set, get);
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const nodeId = uuidv4();
    const taskNode: TaskNode = {
      nodeId, type, agentIds: [], instruction: "", status: "pending", outputCache: null, executionHash: null, position, data: {},
      ...(type === "switch" ? { switchBranches: ["branch_1", "branch_2"] } : {}),
      ...(type === "loop" ? { loopConfig: { maxIterations: 5, condition: "" } } : {}),
    };
    // Update projects array
    const updatedProj = updateProjectInState(projects, activeProjectId, (p) => ({
      ...p, workflow: { ...p.workflow, nodes: [...p.workflow.nodes, taskNode] },
    }));
    // Update local state
    const newProj: Project = { ...project, workflow: { ...project.workflow, nodes: [...project.workflow.nodes, taskNode] }, updatedAt: new Date().toISOString() };
    const bossNode = taskNodeToBossNode(taskNode, [], []);
    set({ projects: updatedProj, project: newProj, canvasNodes: [...get().canvasNodes, bossNode] });
  },

  updateNode: (nodeId, updates) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;

    // Reset node + downstream when instruction or agentIds change
    const shouldInvalidate =
      "instruction" in updates || "agentIds" in updates;
    if (shouldInvalidate) pushHistory(set, get);
    const node = project.workflow.nodes.find((n) => n.nodeId === nodeId);
    const effectiveUpdates = shouldInvalidate
      ? { ...updates, status: "pending" as const, outputCache: null, executionHash: null, wasCached: undefined as boolean | undefined }
      : updates;

    let newNodes = project.workflow.nodes.map((n) =>
      n.nodeId === nodeId ? { ...n, ...effectiveUpdates } : n
    );

    // Cascade: reset all downstream nodes
    if (shouldInvalidate) {
      const children = new Map<string, string[]>();
      for (const n of newNodes) children.set(n.nodeId, []);
      for (const e of project.workflow.edges) {
        children.get(e.sourceNodeId)?.push(e.targetNodeId);
      }
      const queue = [nodeId];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const child of children.get(cur) ?? []) {
          if (!visited.has(child)) {
            visited.add(child);
            queue.push(child);
            newNodes = newNodes.map((n) =>
              n.nodeId === child && n.status === "completed"
                ? { ...n, status: "pending" as const, outputCache: null, executionHash: null, wasCached: undefined as boolean | undefined }
                : n
            );
          }
        }
      }
    }

    const updatedProj = updateProjectInState(projects, activeProjectId, (p) => ({
      ...p, workflow: { ...p.workflow, nodes: newNodes },
    }));

    const fullNode = newNodes.find((n) => n.nodeId === nodeId);
    const { names: agentNames, avatars: agentAvatars } = getNodeAgents(project, fullNode!);

    // Rebuild canvas for all changed nodes
    const changedIds = new Set<string>();
    changedIds.add(nodeId);
    if (shouldInvalidate) {
      const children = new Map<string, string[]>();
      for (const n of newNodes) children.set(n.nodeId, []);
      for (const e of project.workflow.edges) children.get(e.sourceNodeId)?.push(e.targetNodeId);
      const queue = [nodeId];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const child of children.get(cur) ?? []) {
          if (!visited.has(child)) { visited.add(child); queue.push(child); changedIds.add(child); }
        }
      }
    }

    const updatedCanvas = get().canvasNodes.map((cn) => {
      if (!changedIds.has(cn.id)) return cn;
      const nn = newNodes.find((n) => n.nodeId === cn.id);
      if (!nn) return cn;
      const names = project.agents.filter((a) => nn.agentIds.includes(a.agentId)).map((a) => a.name);
      return taskNodeToBossNode(nn, names, agentAvatars);
    });

    set({
      projects: updatedProj,
      project: { ...project, workflow: { ...project.workflow, nodes: newNodes }, updatedAt: new Date().toISOString() },
      canvasNodes: updatedCanvas,
    });
  },

  resizeNode: (nodeId, width, height) => {
    const { project, projects, activeProjectId, canvasNodes } = get();
    if (!project) return;

    const updatedProj = updateProjectInState(projects, activeProjectId, (p) => ({
      ...p, workflow: {
        ...p.workflow,
        nodes: p.workflow.nodes.map((n) => n.nodeId === nodeId ? { ...n, width, height } : n),
      },
    }));

    set({
      projects: updatedProj,
      project: {
        ...project,
        workflow: {
          ...project.workflow,
          nodes: project.workflow.nodes.map((n) => n.nodeId === nodeId ? { ...n, width, height } : n),
        },
        updatedAt: new Date().toISOString(),
      },
      canvasNodes: canvasNodes.map((cn) => cn.id === nodeId ? { ...cn, data: { ...cn.data, width, height }, width, height } : cn),
    });
  },

  duplicateNode: (nodeId) => {
    pushHistory(set, get);
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const source = project.workflow.nodes.find((n) => n.nodeId === nodeId);
    if (!source) return;

    const newNodeId = uuidv4();
    const dup: TaskNode = {
      ...source,
      nodeId: newNodeId,
      status: "pending",
      outputCache: null,
      executionHash: null,
      position: { x: source.position.x + 50, y: source.position.y + 50 },
      agentIds: [...source.agentIds],
    };

    const updatedProj = updateProjectInState(projects, activeProjectId, (p) => ({
      ...p, workflow: { ...p.workflow, nodes: [...p.workflow.nodes, dup] },
    }));

    const { names: dNames, avatars: dAvatars } = getNodeAgents(project, dup);
    const bossNode = taskNodeToBossNode(dup, dNames, dAvatars);

    set({
      projects: updatedProj,
      project: { ...project, workflow: { ...project.workflow, nodes: [...project.workflow.nodes, dup] }, updatedAt: new Date().toISOString() },
      canvasNodes: [...get().canvasNodes, bossNode],
    });
  },

  removeNode: (nodeId) => {
    pushHistory(set, get);
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const updatedProj = updateProjectInState(projects, activeProjectId, (p) => ({
      ...p, workflow: {
        nodes: p.workflow.nodes.filter((n) => n.nodeId !== nodeId),
        edges: p.workflow.edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
      },
    }));
    set({
      projects: updatedProj,
      project: {
        ...project,
        workflow: {
          nodes: project.workflow.nodes.filter((n) => n.nodeId !== nodeId),
          edges: project.workflow.edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
        },
        updatedAt: new Date().toISOString(),
      },
      canvasNodes: get().canvasNodes.filter((n) => n.id !== nodeId),
      canvasEdges: get().canvasEdges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    });
  },

  // ── Edges ─────────────────────────────────────────────────────

  addEdge: (source, target, label, sourceHandle) => {
    pushHistory(set, get);
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const edgeId = uuidv4();
    const edge: WorkflowEdge = { edgeId, sourceNodeId: source, targetNodeId: target, label };
    const bossEdge: BossEdge = {
      id: edgeId, source, target, sourceHandle, type: "smoothstep", animated: false,
      data: label ? { label } : undefined, label,
      labelStyle: label ? { fill: "#8b8fa3", fontSize: 10 } : undefined,
      labelBgStyle: label ? { fill: "#1a1d27" } : undefined,
    };
    const updatedProj = updateProjectInState(projects, activeProjectId, (p) => ({
      ...p, workflow: { ...p.workflow, edges: [...p.workflow.edges, edge] },
    }));
    set({
      projects: updatedProj,
      project: { ...project, workflow: { ...project.workflow, edges: [...project.workflow.edges, edge] }, updatedAt: new Date().toISOString() },
      canvasEdges: [...get().canvasEdges, bossEdge],
    });
  },

  removeEdge: (edgeId) => {
    pushHistory(set, get);
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const updatedProj = updateProjectInState(projects, activeProjectId, (p) => ({
      ...p, workflow: { ...p.workflow, edges: p.workflow.edges.filter((e) => e.edgeId !== edgeId) },
    }));
    set({
      projects: updatedProj,
      project: { ...project, workflow: { ...project.workflow, edges: project.workflow.edges.filter((e) => e.edgeId !== edgeId) }, updatedAt: new Date().toISOString() },
      canvasEdges: get().canvasEdges.filter((e) => e.id !== edgeId),
    });
  },

  // ── Execution ─────────────────────────────────────────────────

  runWorkflow: async () => {
    const { project } = get();
    if (!project) return;
    // Reset ALL nodes to pending
    _runWorkflowImpl(project, () => true);
  },

  runWorkflowFromNode: async (nodeId: string) => {
    const { project } = get();
    if (!project) return;

    // Find all strictly downstream nodes (excluding nodeId itself)
    const toReset = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of project.workflow.edges) {
        if (edge.sourceNodeId === current && !toReset.has(edge.targetNodeId)) {
          toReset.add(edge.targetNodeId);
          queue.push(edge.targetNodeId);
        }
      }
    }

    // Only reset downstream; current node + upstream stay as-is
    _runWorkflowImpl(project, (node) => toReset.has(node.nodeId));
  },

  // ── Undo / Redo ────────────────────────────────────────────────

  undo: () => {
    const { past, project, projects, activeProjectId } = get();
    if (!project || past.length === 0) return;
    const prev = past[past.length - 1];
    const current: WorkflowSnapshot = {
      nodes: project.workflow.nodes.map((n) => ({ ...n })),
      edges: project.workflow.edges.map((e) => ({ ...e })),
    };
    const newNodes = prev.nodes;
    const newEdges = prev.edges;

    const updatedProj = updateProjectInState(projects, activeProjectId!, (p) => ({
      ...p, workflow: { nodes: newNodes, edges: newEdges },
    }));
    const canvas = buildCanvasFromNodes(newNodes, project.agents);
    const canvasEdgesList = buildCanvasEdges(newEdges, newNodes);
    set({
      projects: updatedProj,
      project: { ...project, workflow: { nodes: newNodes, edges: newEdges }, updatedAt: new Date().toISOString() },
      canvasNodes: canvas.nodes,
      canvasEdges: canvasEdgesList,
      past: past.slice(0, -1),
      future: [current, ...get().future].slice(0, MAX_HISTORY),
      selectedNodeId: null,
      rightPanel: null,
    });
  },

  redo: () => {
    const { future, project, projects, activeProjectId } = get();
    if (!project || future.length === 0) return;
    const next = future[0];
    const current: WorkflowSnapshot = {
      nodes: project.workflow.nodes.map((n) => ({ ...n })),
      edges: project.workflow.edges.map((e) => ({ ...e })),
    };
    const newNodes = next.nodes;
    const newEdges = next.edges;

    const updatedProj = updateProjectInState(projects, activeProjectId!, (p) => ({
      ...p, workflow: { nodes: newNodes, edges: newEdges },
    }));
    const canvas = buildCanvasFromNodes(newNodes, project.agents);
    const canvasEdgesList = buildCanvasEdges(newEdges, newNodes);
    set({
      projects: updatedProj,
      project: { ...project, workflow: { nodes: newNodes, edges: newEdges }, updatedAt: new Date().toISOString() },
      canvasNodes: canvas.nodes,
      canvasEdges: canvasEdgesList,
      past: [...get().past, current].slice(0, MAX_HISTORY),
      future: future.slice(1),
      selectedNodeId: null,
      rightPanel: null,
    });
  },

  // ── Selection / Panel / Layout ────────────────────────────────

  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId, rightPanel: nodeId ? "properties" : null });
  },
  setRightPanel: (panel) => set({ rightPanel: panel }),
  setEditingAgentId: (agentId) => set({ editingAgentId: agentId }),

  openRolePicker: (nodeId) => set({ rolePickerNodeId: nodeId }),

  autoLayout: () => {
    const { project, canvasNodes, canvasEdges, projects, activeProjectId } = get();
    if (!project || canvasNodes.length === 0) return;

    const V_SPACING = 250;
    const START_X = 60, START_Y = 60;
    const NODE_WIDTH_REGULAR = 280, NODE_WIDTH_DECISION = 220, H_GAP = 200;

    const parentsOf = new Map<string, string[]>();
    const childrenOf = new Map<string, string[]>();
    const allIds = new Set(canvasNodes.map((n) => n.id));
    for (const n of canvasNodes) { parentsOf.set(n.id, []); childrenOf.set(n.id, []); }
    for (const e of canvasEdges) {
      if (allIds.has(e.source) && allIds.has(e.target)) {
        parentsOf.get(e.target)!.push(e.source);
        childrenOf.get(e.source)!.push(e.target);
      }
    }

    const depth = new Map<string, number>();
    const inDegree = new Map<string, number>();
    for (const [id, parents] of parentsOf) inDegree.set(id, parents.length);

    const queue: string[] = [];
    for (const [id, deg] of inDegree) { if (deg === 0) { depth.set(id, 0); queue.push(id); } }
    if (queue.length === 0 && canvasNodes.length > 0) { depth.set(canvasNodes[0].id, 0); queue.push(canvasNodes[0].id); }

    while (queue.length > 0) {
      const cur = queue.shift()!, curD = depth.get(cur)!;
      for (const child of childrenOf.get(cur) ?? []) {
        inDegree.set(child, inDegree.get(child)! - 1);
        depth.set(child, Math.max(depth.get(child) ?? -1, curD + 1));
        if (inDegree.get(child) === 0 && !queue.includes(child)) queue.push(child);
      }
    }
    for (const id of allIds) { if (!depth.has(id)) depth.set(id, 0); }

    const layers = new Map<number, string[]>();
    for (const [id, d] of depth) { if (!layers.has(d)) layers.set(d, []); layers.get(d)!.push(id); }

    const nodeById = new Map(canvasNodes.map((n) => [n.id, n]));

    // ── Crossing minimization (barycenter method) ──────────────
    const maxDepth = Math.max(...layers.keys());
    const sortedLayers = new Map<number, string[]>();

    // Initial ordering: sort by current Y position
    for (const [d, ids] of layers) {
      const sorted = [...ids].sort((a, b) => (nodeById.get(a)?.position.y ?? 0) - (nodeById.get(b)?.position.y ?? 0));
      sortedLayers.set(d, sorted);
    }

    // Apply barycenter heuristic to reduce crossings
    for (let pass = 0; pass < 4; pass++) {
      // Top-down pass
      for (let d = 1; d <= maxDepth; d++) {
        const ids = sortedLayers.get(d)!;
        const barycenter = new Map<string, number>();
        for (const id of ids) {
          const parents = parentsOf.get(id) || [];
          if (parents.length === 0) { barycenter.set(id, -1); continue; }
          let sum = 0, count = 0;
          const upperOrder = sortedLayers.get(d - 1) || [];
          for (const p of parents) {
            const idx = upperOrder.indexOf(p);
            if (idx >= 0) { sum += idx; count++; }
          }
          barycenter.set(id, count > 0 ? sum / count : -1);
        }
        sortedLayers.set(d, ids.sort((a, b) => (barycenter.get(a) ?? -1) - (barycenter.get(b) ?? -1)));
      }

      // Bottom-up pass
      for (let d = maxDepth - 1; d >= 0; d--) {
        const ids = sortedLayers.get(d)!;
        const barycenter = new Map<string, number>();
        for (const id of ids) {
          const children = childrenOf.get(id) || [];
          if (children.length === 0) { barycenter.set(id, -1); continue; }
          let sum = 0, count = 0;
          const lowerOrder = sortedLayers.get(d + 1) || [];
          for (const c of children) {
            const idx = lowerOrder.indexOf(c);
            if (idx >= 0) { sum += idx; count++; }
          }
          barycenter.set(id, count > 0 ? sum / count : -1);
        }
        sortedLayers.set(d, ids.sort((a, b) => (barycenter.get(a) ?? -1) - (barycenter.get(b) ?? -1)));
      }
    }

    // ── Compute layer widths and positions ─────────────────────
    const layerWidths = new Map<number, number>();
    for (const [d, ids] of sortedLayers) {
      layerWidths.set(d, ids.reduce((s, id) => s + (nodeById.get(id)?.type === "decisionNode" ? NODE_WIDTH_DECISION : NODE_WIDTH_REGULAR), 0) + (ids.length - 1) * H_GAP);
    }
    const maxW = Math.max(...layerWidths.values(), 600);

    const newPositions = new Map<string, { x: number; y: number }>();
    for (let d = 0; d <= maxDepth; d++) {
      const ids = sortedLayers.get(d) ?? [];
      const offsetX = (maxW - (layerWidths.get(d) ?? 600)) / 2;
      let cx = 0;
      for (const id of ids) {
        const isD = nodeById.get(id)?.type === "decisionNode";
        newPositions.set(id, { x: START_X + offsetX + cx, y: START_Y + d * V_SPACING + (isD ? 10 : 0) });
        cx += (isD ? NODE_WIDTH_DECISION : NODE_WIDTH_REGULAR) + H_GAP;
      }
    }

    const updatedNodes = project.workflow.nodes.map((n) => { const pos = newPositions.get(n.nodeId); return pos ? { ...n, position: pos } : n; });
    const updatedCanvas = canvasNodes.map((n) => { const pos = newPositions.get(n.id); return pos ? { ...n, position: pos } : n; });
    const updatedProj = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, workflow: { ...p.workflow, nodes: updatedNodes } }));
    set({ projects: updatedProj, project: { ...project, workflow: { ...project.workflow, nodes: updatedNodes }, updatedAt: new Date().toISOString() }, canvasNodes: updatedCanvas, layoutVersion: get().layoutVersion + 1 });
  },

  syncCanvasToWorkflow: (nodes, edges) => {
    const { project, projects, activeProjectId } = get();
    if (!project) return;
    const wEdges: WorkflowEdge[] = edges.map((e) => ({ edgeId: e.id, sourceNodeId: e.source, targetNodeId: e.target, label: typeof e.label === "string" ? e.label : undefined }));
    const updatedProj = updateProjectInState(projects, activeProjectId, (p) => ({ ...p, workflow: { ...p.workflow, edges: wEdges } }));
    set({ projects: updatedProj, canvasNodes: nodes, canvasEdges: edges, project: { ...project, workflow: { ...project.workflow, edges: wEdges }, updatedAt: new Date().toISOString() } });
  },
}));

// ─── Shared Workflow Execution ────────────────────────────────────

async function _runWorkflowImpl(
  project: Project,
  shouldReset: (node: TaskNode) => boolean,
) {
  const { projects, activeProjectId, isRunning } = useProjectStore.getState();
  if (!project || isRunning) return;

  // Reset only nodes matching the predicate
  const resetNodes = project.workflow.nodes.map((n) =>
    shouldReset(n)
      ? { ...n, status: "pending" as const, outputCache: null, executionHash: null }
      : n,
  );
  const resetProj = updateProjectInState(projects, activeProjectId!, (p) => ({
    ...p, workflow: { ...p.workflow, nodes: resetNodes },
  }));
  const totalCount = resetNodes.filter((n) => n.type !== "output" && n.type !== "logic" && shouldReset(n)).length;
  useProjectStore.setState({
    projects: resetProj,
    project: { ...project, workflow: { ...project.workflow, nodes: resetNodes }, updatedAt: new Date().toISOString() },
    canvasNodes: useProjectStore.getState().canvasNodes.map((cn) => {
      const rn = resetNodes.find((n) => n.nodeId === cn.id);
      const { names: rNames, avatars: rAvatars } = getNodeAgents(project, rn!);
      return rn ? taskNodeToBossNode(rn, rNames, rAvatars) : cn;
    }),
    isRunning: true,
    runProgress: { completed: 0, total: totalCount },
  });

  try {
    const projectSnapshot = { ...useProjectStore.getState().project!, workflow: { ...useProjectStore.getState().project!.workflow, nodes: resetNodes } };
    const updatedNodes = await executeWorkflow(
      project.projectId,
      projectSnapshot,
      (progress) => {
        const { project: proj } = useProjectStore.getState();
        if (!proj) return;
        const node = proj.workflow.nodes.find((n) => n.nodeId === progress.nodeId);
        if (!node) return;
        const updatedNode: TaskNode = {
          ...node, status: progress.status,
          outputCache: progress.status === "completed" ? (progress.output ?? node.outputCache) : progress.status === "error" ? (progress.error ?? node.outputCache) : node.outputCache,
          errorDetail: progress.status === "error" ? (progress.errorDetail ?? node.errorDetail) : node.errorDetail,
          wasCached: progress.cached === true ? true : progress.cached === false ? false : node.wasCached,
        };
        const newNodes = proj.workflow.nodes.map((n) => n.nodeId === progress.nodeId ? updatedNode : n);
        const { names: agentNames, avatars } = getNodeAgents(proj, updatedNode);
        useProjectStore.setState({
          project: { ...proj, workflow: { ...proj.workflow, nodes: newNodes }, updatedAt: new Date().toISOString() },
          canvasNodes: useProjectStore.getState().canvasNodes.map((cn) => cn.id === progress.nodeId
            ? taskNodeToBossNode(updatedNode, agentNames, avatars, progress.timeoutWarning)
            : cn),
          runProgress: progress.status === "completed" || progress.status === "error"
            ? { ...useProjectStore.getState().runProgress, completed: useProjectStore.getState().runProgress.completed + 1 }
            : useProjectStore.getState().runProgress,
        });
      },
    );

    // Final update
    const { project: finalProj, projects: finalProjects, activeProjectId: finalActiveId } = useProjectStore.getState();
    if (!finalProj || !finalActiveId) return;
    const finalProjUpdated = updateProjectInState(finalProjects, finalActiveId, (p) => ({
      ...p, workflow: { ...p.workflow, nodes: updatedNodes },
    }));
    const finalCanvas = updatedNodes.map((n) => {
      const g = getNodeAgents(finalProj, n);
      return taskNodeToBossNode(n, g.names, g.avatars);
    });
    useProjectStore.setState({
      projects: finalProjUpdated,
      project: { ...finalProj, workflow: { ...finalProj.workflow, nodes: updatedNodes }, updatedAt: new Date().toISOString() },
      canvasNodes: finalCanvas,
      isRunning: false,
    });

    runGoalValidation();
    saveOutputsToFolder();
  } catch (err: any) {
    useProjectStore.setState({ isRunning: false });
    import("@tauri-apps/plugin-dialog").then(({ message }) => {
      message(`Execution failed:\n${err?.message || err}`, { title: "Flowith Error", kind: "error" }).catch(() => {});
    }).catch(() => {
      alert(`Execution failed: ${err?.message || err}`);
    });
  }
}

async function saveOutputsToFolder() {
  const { project: p } = useProjectStore.getState();
  if (!p) return;
  const { saveAllOutputs, hasFolderAccess } = await import("@/services/fileStorage");
  if (!hasFolderAccess()) return;

  const outputs = p.workflow.nodes
    .filter((n) => n.outputCache)
    .map((n) => ({
      name: n.instruction || n.type,
      content: n.outputCache!,
      type: n.type,
    }));

  if (outputs.length > 0) {
    await saveAllOutputs(outputs);
  }
}

// ─── Goal Validation ──────────────────────────────────────────────

async function runGoalValidation() {
  const { project } = useProjectStore.getState();
  if (!project) return;

  const outputNode = project.workflow.nodes.find((n) => n.type === "output");
  if (!outputNode || !outputNode.outputCache) return;

  const goal = project.goal || "(no goal defined)";
  const result = outputNode.outputCache;

  try {
    const validationPrompt = `You are a project validator. Compare the project GOAL against the final OUTPUT. Score how well the output meets the goal.

GOAL:
${goal}

OUTPUT:
${result.slice(0, 3000)}

Reply ONLY with a JSON object (no markdown, no explanation):
{
  "score": <number 1-10>,
  "passed": <boolean — true if score >= 6>,
  "summary": "<one-line summary in same language as the goal>",
  "notes": "<detailed feedback in same language as the goal>"
}`;

    const savedMode = llmService.getMode();
    const response = await llmService.call(
      {
        agentId: "validator",
        name: "Goal Validator",
        provider: "cloud_anthropic",
        modelName: "claude-sonnet-4-20250514",
        systemPrompt: "You are a project goal validator. Output clean JSON only.",
        temperature: 0.2,
        toolsAllowed: [],
        createdAt: "",
        updatedAt: "",
      },
      validationPrompt,
    );

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const validation = JSON.parse(jsonMatch[0]);
    const score = validation.score ?? 5;
    const passed = validation.passed ?? score >= 6;
    const summary = validation.summary ?? "";
    const notes = validation.notes ?? "";

    // Update the output node with validation result
    const emoji = score >= 8 ? "🌟" : score >= 6 ? "✅" : score >= 4 ? "⚠️" : "❌";
    const validationText = `\n\n=== Goal Validation ===\n${emoji} Score: ${score}/10 — ${passed ? "PASSED" : "FAILED"}\n📝 ${summary}\n\n${notes}`;

    const updatedOutput = {
      ...outputNode,
      outputCache: (outputNode.outputCache ?? "") + validationText,
    };

    const updatedNodes = project.workflow.nodes.map((n) =>
      n.nodeId === outputNode.nodeId ? updatedOutput : n,
    );

    const updatedProj = updateProjectInState(
      useProjectStore.getState().projects,
      useProjectStore.getState().activeProjectId,
      (p) => ({ ...p, workflow: { ...p.workflow, nodes: updatedNodes } }),
    );

    const { names: agentNames, avatars } = getNodeAgents(project, updatedOutput);

    useProjectStore.setState({
      projects: updatedProj,
      project: { ...project, workflow: { ...project.workflow, nodes: updatedNodes }, updatedAt: new Date().toISOString() },
      canvasNodes: useProjectStore.getState().canvasNodes.map((cn) =>
        cn.id === outputNode.nodeId ? taskNodeToBossNode(updatedOutput, agentNames, avatars) : cn,
      ),
    });
  } catch {
    // Validation failed silently — not critical
  }
}

// ─── Auto-save to SQLite + localStorage ───────────────────────────

useProjectStore.subscribe((state) => {
  saveProjects(state.projects, state.activeProjectId);
  // Also save to folder
  import("@/services/fileStorage").then(({ saveToFolder, hasFolderAccess }) => {
    if (hasFolderAccess() && state.activeProjectId) {
      const project = state.projects.find((p) => p.projectId === state.activeProjectId);
      if (project) {
        saveToFolder(state.activeProjectId, JSON.stringify(project, null, 2));
      }
    }
  });
});

// ─── Async SQLite initialization (runs after store creation) ──────

(async () => {
  try {
    // Try to migrate old localStorage data to SQLite
    const migrated = await migrateFromLocalStorage();
    if (migrated) {
      console.log("[Store] localStorage data migrated to SQLite");
    }
    // Reload from SQLite to get the canonical state
    const sqlData = await loadAllProjects();
    if (sqlData.projects.length > 0) {
      sanitizeProjects(sqlData.projects);
      const activeP = sqlData.projects.find((p) => p.projectId === sqlData.activeProjectId) ?? null;
      const canvas = buildCanvasFromProject(activeP);
      useProjectStore.setState({
        projects: sqlData.projects,
        activeProjectId: sqlData.activeProjectId,
        project: activeP,
        canvasNodes: canvas.canvasNodes,
        canvasEdges: canvas.canvasEdges,
      });
      console.log(`[Store] Loaded ${sqlData.projects.length} projects from SQLite`);
    }
  } catch (e) {
    console.warn("[Store] SQLite init failed, using localStorage:", e);
  }
})();
