import type { Project, TaskNode, WorkflowEdge, AgentProfile } from "@/types/project";
import type { StructuredError } from "@/types/errors";
import { FlowithAgentError } from "@/types/errors";
import { llmService } from "./llmService";
import { getContext } from "./kbService";
import { logger, metrics, startNodeTimer, endNodeTimer } from "./loggerService";

// ─── Hashing ──────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "sha256:" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Topological Sort ────────────────────────────────────────────

function topologicalSort(
  nodes: TaskNode[],
  edges: WorkflowEdge[],
): string[] {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const n of nodes) {
    adj.set(n.nodeId, []);
    inDegree.set(n.nodeId, 0);
  }
  for (const e of edges) {
    adj.get(e.sourceNodeId)?.push(e.targetNodeId);
    inDegree.set(e.targetNodeId, (inDegree.get(e.targetNodeId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const neighbor of adj.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

// ─── Execution Context ───────────────────────────────────────────

export interface ExecutionProgress {
  nodeId: string;
  status: "pending" | "running" | "completed" | "error";
  output?: string;
  error?: string;
  errorDetail?: StructuredError;
  /** Set to true when this result came from cache (hash matched) instead of fresh execution */
  cached?: boolean;
  /** Set when the node is still running but exceeded the soft timeout */
  timeoutWarning?: string;
}

export type ProgressCallback = (progress: ExecutionProgress) => void;

// ─── Main Execute Function ───────────────────────────────────────

export async function executeWorkflow(
  projectId: string,
  project: Project,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<TaskNode[]> {
  const { nodes, edges } = project.workflow;
  const agents = project.agents;

  // Reset per-run metrics
  metrics.resetRun();
  metrics.recordRun();
  logger.info("execution", `Workflow started: ${project.name}`, { projectId, nodeCount: nodes.length, edgeCount: edges.length });

  // Build lookup
  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));
  const upstreamMap = new Map<string, string[]>();
  for (const n of nodes) upstreamMap.set(n.nodeId, []);
  for (const e of edges) {
    upstreamMap.get(e.targetNodeId)?.push(e.sourceNodeId);
  }

  // Topological order
  const order = topologicalSort(nodes, edges);

  // Collect upstream outputs for each node
  const outputs = new Map<string, string>();

  // Clone nodes to avoid mutating store directly (caller will apply)
  const updatedNodes = nodes.map((n) => ({ ...n }));

  for (const nodeId of order) {
    if (signal?.aborted) break;

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    onProgress({ nodeId, status: "running" });
    startNodeTimer(nodeId);
    logger.debug("execution", `Node started: ${nodeId.slice(0, 8)} (${node.type})`);

    // Gather upstream outputs
    const upstreamIds = upstreamMap.get(nodeId) ?? [];
    const upstreamOutputs: Record<string, string> = {};
    for (const uid of upstreamIds) {
      const out = outputs.get(uid);
      if (out !== undefined) upstreamOutputs[uid] = out;
    }

    // Compute input hash
    const agentsForNode = agents.filter((a) => node.agentIds.includes(a.agentId));

    // Fetch knowledge base context for task nodes with assigned agents
    let kbContext = "";
    let agentsWithContext = agentsForNode;
    if (node.type === "task" && agentsForNode.length > 0) {
      try {
        kbContext = await getContext(projectId, node.instruction, 3);
        if (kbContext) {
          agentsWithContext = agentsForNode.map((a) => ({
            ...a,
            systemPrompt: `[Knowledge Base Context]\n${kbContext}\n\n---\n\n${a.systemPrompt}`,
          }));
        }
      } catch {
        // KB not available — continue without context
      }
    }

    const hashInput = JSON.stringify({
      instruction: node.instruction,
      type: node.type,
      agents: agentsWithContext.map((a) => ({
        name: a.name,
        provider: a.provider,
        model: a.modelName,
        systemPrompt: a.systemPrompt,
        temperature: a.temperature,
      })),
      upstreamOutputs,
      kbContext,
    });
    const newHash = await sha256(hashInput);

    // Check cache
    if (node.executionHash === newHash && node.outputCache !== null && node.status === "completed") {
      outputs.set(nodeId, node.outputCache);
      // Mark as cached for visual indicator
      const cIdx = updatedNodes.findIndex((n) => n.nodeId === nodeId);
      if (cIdx !== -1) updatedNodes[cIdx].wasCached = true;
      metrics.recordCacheHit(nodeId);
      logger.info("cache", `Cache hit: ${nodeId.slice(0, 8)}`, { nodeId, nodeType: node.type });
      onProgress({ nodeId, status: "completed", output: node.outputCache, cached: true });
      continue;
    }

    // Execute based on type — with soft timeout
    const execPromise = executeNode(node, upstreamOutputs, agentsWithContext, signal);

    // Soft timeout: emit warning after threshold but keep waiting
    const SOFT_TIMEOUT_MS = 120_000;
    const timeoutTimer = setTimeout(() => {
      const seconds = Math.round(SOFT_TIMEOUT_MS / 1000);
      onProgress({
        nodeId,
        status: "running",
        timeoutWarning: `响应时间已超过 ${seconds} 秒，仍在等待模型生成...`,
      });
    }, SOFT_TIMEOUT_MS);

    try {
        const result = await execPromise;
        clearTimeout(timeoutTimer);

        const idx = updatedNodes.findIndex((n) => n.nodeId === nodeId);
        if (idx !== -1) {
          updatedNodes[idx].status = "completed";
          updatedNodes[idx].outputCache = result;
          updatedNodes[idx].executionHash = newHash;
          updatedNodes[idx].wasCached = false;
        }

        outputs.set(nodeId, result);
        const elapsed = endNodeTimer(nodeId);
        metrics.recordCacheMiss(nodeId);
        onProgress({ nodeId, status: "completed", output: result, cached: false });

        // Recursively reset downstream nodes
        invalidateDownstream(nodeId, updatedNodes, edges);
      } catch (execErr: any) {
        clearTimeout(timeoutTimer);

        // Don't treat AbortError from soft-timeout-aware abort as an error — re-throw to break loop
        if (execErr?.name === "AbortError") {
          // If user manually stopped (external signal), emit final event and break
          if (signal?.aborted) {
            onProgress({ nodeId, status: "error", error: "工作流已被用户停止" });
            break;
          }
          // Otherwise, this is a hard failure — treat as error (fall through)
        }

        const idx = updatedNodes.findIndex((n) => n.nodeId === nodeId);
        const errorMessage = execErr?.message ?? String(execErr);
        const errorDetail: StructuredError | undefined =
          execErr instanceof FlowithAgentError
            ? execErr.toStructuredError()
            : {
                errorCode: "UNKNOWN" as any,
                message: errorMessage,
                suggestion: "检查服务状态后重试",
                severity: "error" as const,
                recoverable: true,
                rawMessage: errorMessage,
              };
        if (idx !== -1) {
          updatedNodes[idx].status = "error";
          updatedNodes[idx].outputCache = errorMessage;
          updatedNodes[idx].errorDetail = errorDetail;
        }
        logger.error("execution", `Node failed: ${nodeId.slice(0, 8)} — ${errorMessage}`, { nodeId, errorCode: errorDetail?.errorCode, errorMessage });
        if (errorDetail?.errorCode) metrics.recordError(errorDetail.errorCode);
        onProgress({ nodeId, status: "error", error: errorMessage, errorDetail });
      }
  }

  return updatedNodes;
}

// ─── Per-Node Execution ──────────────────────────────────────────

async function executeNode(
  node: TaskNode,
  upstreamOutputs: Record<string, string>,
  agents: AgentProfile[],
  signal?: AbortSignal,
): Promise<string> {
  const nodeId = node.nodeId;
  switch (node.type) {
    case "input": {
      const src = node.inputSource ?? "text";
      if (src === "file" && node.inputContent) {
        // File content is stored as base64 data URL — return filename + preview
        return `[File: ${node.inputPath ?? "unknown"}]\n${node.inputContent.slice(0, 500)}${node.inputContent.length > 500 ? "..." : ""}`;
      }
      if (src === "url" && node.inputPath) {
        try {
          const res = await fetch(node.inputPath, { signal });
          const text = await res.text();
          return `[URL: ${node.inputPath}]\n${text.slice(0, 2000)}`;
        } catch {
          return `[URL: ${node.inputPath}]\n(Failed to fetch content)`;
        }
      }
      return node.instruction || "(empty input)";
    }

    case "logic": {
      // Merge upstream outputs into structured context
      const parts = Object.entries(upstreamOutputs).map(
        ([id, out]) => `[${id.slice(0, 8)}]: ${out}`,
      );
      return parts.length > 0
        ? `=== Merged Context ===\n${parts.join("\n\n")}`
        : "(no upstream data)";
    }

    case "decision": {
      if (agents.length === 0) {
        // No agents assigned — default to checking if upstream has content
        const hasContent = Object.values(upstreamOutputs).some((o) => o.trim().length > 0);
        return hasContent ? "yes" : "no";
      }
      // Use LLM to evaluate
      const context = Object.values(upstreamOutputs).join("\n\n");
      const prompt = `Evaluate the following condition. Reply ONLY with "yes" or "no".\n\nCondition: ${node.instruction}\n\nContext:\n${context}`;
      const response = await llmService.call(agents[0], prompt, signal, nodeId);
      return response.trim().toLowerCase().startsWith("y") ? "yes" : "no";
    }

    case "switch": {
      if (agents.length === 0) {
        // Default to first branch
        return node.switchBranches?.[0] ?? "branch_1";
      }
      const branches = node.switchBranches ?? ["branch_1", "branch_2"];
      const branchList = branches.map((b, i) => `${i + 1}. ${b}`).join("\n");
      const context = Object.values(upstreamOutputs).join("\n\n");
      const prompt = `Classify the following input and route it to exactly ONE of the listed branches.\n\nBranches:\n${branchList}\n\nInput:\n${context || node.instruction}\n\nReply with ONLY the branch name, nothing else.`;
      const response = await llmService.call(agents[0], prompt, signal, nodeId);
      const matched = branches.find((b) => response.trim().toLowerCase().includes(b.toLowerCase()));
      return matched ?? branches[0];
    }

    case "loop": {
      const maxIter = node.loopConfig?.maxIterations ?? 5;
      if (agents.length === 0) {
        return "done";
      }
      const context = Object.values(upstreamOutputs).join("\n\n");
      const condition = node.loopConfig?.condition || "Is the output satisfactory?";
      const prompt = [
        `Iterative processing step. Evaluate the work so far and either improve it or confirm it's done.`,
        ``,
        `Task: ${node.instruction}`,
        ``,
        `Exit condition: ${condition}`,
        ``,
        `Context/Current work:\n${context || "(empty)"}`,
        ``,
        `If the work meets the exit condition, reply with "DONE: <final output>".`,
        `If it needs improvement, reply with "LOOP: <improved version with your changes>".`,
      ].join("\n");
      const response = await llmService.call(agents[0], prompt, signal, nodeId);
      if (response.trim().toUpperCase().startsWith("DONE")) {
        return "done";
      }
      return "loop";
    }

    case "output":
      // Skip if user has saved this output
      if (node.saved && node.outputCache) return node.outputCache;
      return Object.values(upstreamOutputs).join("\n\n---\n\n") || "(no upstream data)";

    case "task": {
      if (agents.length === 0) {
        return `[No agent assigned] Instruction: ${node.instruction}`;
      }

      const context = Object.values(upstreamOutputs).join("\n\n");
      const fmt = node.outputFormat && node.outputFormat !== "auto" ? `\nOutput format: ${node.outputFormat}` : "";
      const taskPrompt = context
        ? `Context from previous steps:\n${context}\n\n---\n\nTask: ${node.instruction}${fmt}`
        : `Task: ${node.instruction}${fmt}`;

      // Multi-agent collaboration — when collaborationMode is set and multiple agents assigned
      if (node.collaborationMode && agents.length > 1) {
        try {
          return await _executeMultiAgent(node.collaborationMode, agents, taskPrompt, signal);
        } catch {
          // Python backend unavailable — fall back to single-agent execution
          return await llmService.call(agents[0], taskPrompt, signal, nodeId);
        }
      }

      // Single agent
      const primaryAgent = agents[0];
      return await llmService.call(primaryAgent, taskPrompt, signal, nodeId);
    }

    default:
      return "(unknown node type)";
  }
}

// ─── Multi-Agent Collaboration ─────────────────────────────────────

const PYTHON_BACKEND_URL = "http://127.0.0.1:8420";

async function _executeMultiAgent(
  mode: string,
  agents: AgentProfile[],
  task: string,
  signal?: AbortSignal,
): Promise<string> {
  const collaborators = agents.map((a, i) => ({
    agent: {
      agent_id: a.agentId,
      name: a.name,
      provider: a.provider,
      model_name: a.modelName,
      system_prompt: a.systemPrompt,
      temperature: a.temperature,
      tools_allowed: a.toolsAllowed || [],
    },
    role: i === 0 ? "worker" : "reviewer",
  }));

  const body = JSON.stringify({
    mode,
    task,
    collaborators,
  });

  const resp = await fetch(`${PYTHON_BACKEND_URL}/agent/execute/multi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(`Multi-agent execution failed: ${err.detail}`);
  }

  const result = await resp.json();
  return result.final_output || result.results?.[0]?.output || "";
}

// ─── Downstream Invalidation ──────────────────────────────────────

function invalidateDownstream(
  changedNodeId: string,
  nodes: TaskNode[],
  edges: WorkflowEdge[],
) {
  const children = new Map<string, string[]>();
  for (const n of nodes) children.set(n.nodeId, []);
  for (const e of edges) {
    children.get(e.sourceNodeId)?.push(e.targetNodeId);
  }

  const queue = [changedNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of children.get(current) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
        const node = nodes.find((n) => n.nodeId === child);
        if (node && node.status === "completed") {
          node.status = "pending";
          node.outputCache = null;
          node.executionHash = null;
          node.wasCached = undefined;
        }
      }
    }
  }
}
