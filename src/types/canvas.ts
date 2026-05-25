/**
 * React Flow canvas-specific types.
 */

import type { Node, Edge } from "@xyflow/react";
import type { NodeStatus, NodeType, InputSource, OutputFormat, CollaborationMode } from "./project";
import type { StructuredError } from "./errors";

// ─── React Flow Node Data ────────────────────────────────────────

export interface BossNodeData {
  [key: string]: unknown;
  label: string;
  nodeType: NodeType;
  agentNames: string[];
  agentAvatars: string[];
  agentIds: string[];
  collaborationMode?: CollaborationMode;
  instruction: string;
  status: NodeStatus;
  outputCache: string | null;
  executionHash: string | null;
  inputSource?: InputSource;
  inputPath?: string;
  inputContent?: string;
  outputFormat?: OutputFormat;
  saved?: boolean;
  errorDetail?: StructuredError;
  /** True when this node result came from cache (hash matched), not fresh execution */
  wasCached?: boolean;
  /** Non-null when the node is still running but past the soft timeout */
  timeoutWarning?: string;
  width?: number;
  height?: number;
  /** Switch node: branch labels — one output handle per branch */
  switchBranches?: string[];
  /** Loop node: iteration config */
  loopConfig?: {
    maxIterations: number;
    condition: string;
  };
}

export type BossNode = Node<BossNodeData, "bossNode" | "decisionNode" | "switchNode" | "loopNode" | "outputNode">;

// ─── React Flow Edge Data ────────────────────────────────────────

export interface BossEdgeData {
  [key: string]: unknown;
  label?: string;
}

export type BossEdge = Edge<BossEdgeData>;

// ─── Canvas State ────────────────────────────────────────────────

export interface CanvasState {
  nodes: BossNode[];
  edges: BossEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
}
