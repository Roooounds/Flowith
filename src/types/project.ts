/**
 * Core data model types for Flowith.
 * Based on PRD Section 2 — Core Data Schemas.
 */

import type { StructuredError } from "./errors";

// ─── Enums & Literals ────────────────────────────────────────────

export type NodeStatus = "pending" | "running" | "completed" | "error";

export type ProviderType = "local_ollama" | "cloud_openai" | "cloud_anthropic" | "cloud_gemini" | "cloud_custom" | "comfyui";

export type NodeType = "task" | "input" | "logic" | "decision" | "switch" | "loop" | "output";

export type CollaborationMode = "sequential" | "parallel" | "debate" | "critique";
export type InputSource = "text" | "file" | "url";
export type OutputFormat = "text" | "markdown" | "csv" | "code" | "image" | "auto";

export type ToolPermission =
  | "web_search"
  | "comfyui_render"
  | "file_read"
  | "file_write"
  | "code_execution"
  | "image_generation";

// ─── Agent Profile ───────────────────────────────────────────────

export interface AgentProfile {
  agentId: string;
  name: string;
  avatarEmoji?: string;
  category?: string;
  provider: ProviderType;
  modelName: string;
  systemPrompt: string;
  temperature: number;
  toolsAllowed: ToolPermission[];
  createdAt: string;
  updatedAt: string;
}

// ─── Node ────────────────────────────────────────────────────────

export interface TaskNode {
  nodeId: string;
  type: NodeType;
  agentIds: string[];
  /** Multi-agent collaboration mode — only relevant when multiple agents assigned */
  collaborationMode?: CollaborationMode;
  instruction: string;
  status: NodeStatus;
  outputCache: string | null;
  executionHash: string | null;
  /** Position on the React Flow canvas */
  position: {
    x: number;
    y: number;
  };
  /** Input source type (Input nodes only) */
  inputSource?: InputSource;
  /** File name or URL for input source */
  inputPath?: string;
  /** File content (base64) or URL content */
  inputContent?: string;
  /** Desired output format for task/input nodes */
  outputFormat?: OutputFormat;
  /** Lock output from being overwritten */
  saved?: boolean;
  /** True when this node was skipped due to cache hit (executionHash matched) */
  wasCached?: boolean;
  /** Structured error detail when status === "error" */
  errorDetail?: StructuredError;
  /** Optional custom node size */
  width?: number;
  height?: number;
  /** Additional structured data input/output for logic nodes */
  data: Record<string, unknown>;
  /** Switch node: branch labels (one output handle per branch) */
  switchBranches?: string[];
  /** Loop node: iteration configuration */
  loopConfig?: {
    maxIterations: number;
    condition: string;
  };
}

// ─── Edge / Connection ───────────────────────────────────────────

export interface WorkflowEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  /** Optional label describing the data passed along this edge */
  label?: string;
}

// ─── Workflow ────────────────────────────────────────────────────

export interface Workflow {
  nodes: TaskNode[];
  edges: WorkflowEdge[];
}

// ─── Project (Top-level Container) ───────────────────────────────

export interface Project {
  projectId: string;
  name: string;
  description: string;
  /** Project-level goal — fixed at top of canvas */
  goal: string;
  /** Local folder path for project storage */
  folderPath?: string;
  /** Reference to a mounted local knowledge base (ChromaDB collection) */
  knowledgeBaseId: string | null;
  workflow: Workflow;
  /** Agent profiles available within this project */
  agents: AgentProfile[];
  /** Deleted agents stored for potential recovery — shown in Load Presets */
  vaultAgents: AgentProfile[];
  /** Preset names that have been permanently deleted — never shown again */
  permanentlyDeletedPresetNames: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Execution Context ───────────────────────────────────────────

export interface ExecutionContext {
  projectId: string;
  nodeId: string;
  agentIds: string[];
  instruction: string;
  /** Accumulated output from all upstream nodes */
  upstreamOutputs: Record<string, string>;
}
