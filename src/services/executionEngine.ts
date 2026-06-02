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

  // Build adjacency: downstream (children) and upstream (parents)
  const downstreamMap = new Map<string, string[]>();
  const upstreamMap = new Map<string, string[]>();
  for (const n of nodes) {
    downstreamMap.set(n.nodeId, []);
    upstreamMap.set(n.nodeId, []);
  }
  for (const e of edges) {
    downstreamMap.get(e.sourceNodeId)?.push(e.targetNodeId);
    upstreamMap.get(e.targetNodeId)?.push(e.sourceNodeId);
  }

  // Topological order for back-edge detection
  const topoOrder = topologicalSort(nodes, edges);
  const topoIndex = new Map(topoOrder.map((id, i) => [id, i]));

  // Execution state
  const outputs = new Map<string, string>();
  const updatedNodes = nodes.map((n) => ({ ...n }));
  const pendingInDegree = new Map<string, number>();
  const iterationCounts = new Map<string, number>();
  const MAX_ITERATIONS_PER_NODE = 20;
  const MAX_TOTAL_STEPS = 100;

  // Initialize pending in-degree
  // Decision nodes: 0 pending (trigger on any upstream input)
  for (const n of nodes) {
    const ups = upstreamMap.get(n.nodeId) ?? [];
    pendingInDegree.set(n.nodeId, n.type === "decision" ? 0 : ups.length);
  }

  // Queue: nodes ready to execute
  const queue: string[] = [];
  for (const n of nodes) {
    if ((pendingInDegree.get(n.nodeId) ?? 0) === 0) {
      queue.push(n.nodeId);
    }
  }
  queue.sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));

  let totalSteps = 0;

  while (queue.length > 0 && !signal?.aborted && totalSteps < MAX_TOTAL_STEPS) {
    totalSteps++;
    const nodeId = queue.shift()!;

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    // Track iterations per node to prevent infinite loops
    const iter = (iterationCounts.get(nodeId) ?? 0) + 1;
    iterationCounts.set(nodeId, iter);
    if (iter > MAX_ITERATIONS_PER_NODE) {
      logger.warn("execution", `Node ${nodeId.slice(0, 8)} exceeded max iterations (${MAX_ITERATIONS_PER_NODE}), halting loop`);
      const existingOutput = outputs.get(nodeId);
      if (existingOutput) {
        const idx = updatedNodes.findIndex((n) => n.nodeId === nodeId);
        if (idx !== -1) {
          updatedNodes[idx].status = "completed";
          updatedNodes[idx].outputCache = existingOutput + "\n\n[Max iterations reached — loop halted]";
        }
      }
      continue;
    }

    onProgress({ nodeId, status: "running" });
    startNodeTimer(nodeId);
    logger.debug("execution", `Node started: ${nodeId.slice(0, 8)} (${node.type}) iter=${iter}`);

    // Gather upstream outputs
    const upstreamIds = upstreamMap.get(nodeId) ?? [];
    const upstreamOutputs: Record<string, string> = {};
    for (const uid of upstreamIds) {
      const out = outputs.get(uid);
      if (out !== undefined) upstreamOutputs[uid] = out;
    }

    // For Decision nodes: skip if no upstream has produced output yet
    if (node.type === "decision" && Object.keys(upstreamOutputs).length === 0) {
      logger.debug("execution", `Decision node ${nodeId.slice(0, 8)} has no upstream outputs yet, waiting`);
      iterationCounts.set(nodeId, iter - 1);
      continue;
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

    // Check cache — only for first execution (iter === 1)
    if (iter === 1 && node.executionHash === newHash && node.outputCache !== null && node.status === "completed") {
      outputs.set(nodeId, node.outputCache);
      const cIdx = updatedNodes.findIndex((n) => n.nodeId === nodeId);
      if (cIdx !== -1) updatedNodes[cIdx].wasCached = true;
      metrics.recordCacheHit(nodeId);
      logger.info("cache", `Cache hit: ${nodeId.slice(0, 8)}`, { nodeId, nodeType: node.type });
      onProgress({ nodeId, status: "completed", output: node.outputCache, cached: true });
      // Notify downstream nodes
      notifyDownstream(node, updatedNodes, outputs, downstreamMap, pendingInDegree, topoIndex, queue);
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

        // Notify downstream nodes (add ready nodes to queue)
        notifyDownstream(node, updatedNodes, outputs, downstreamMap, pendingInDegree, topoIndex, queue);

        // Handle Decision "no" → loop-back to upstream nodes
        if (node.type === "decision" && result.trim().toLowerCase() === "no") {
          handleLoopBack(nodeId, downstreamMap, topoIndex, updatedNodes, outputs, iterationCounts, queue, edges);
        }
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

  if (totalSteps >= MAX_TOTAL_STEPS) {
    logger.warn("execution", `Workflow halted: exceeded max steps (${MAX_TOTAL_STEPS})`);
  }

  return updatedNodes;
}

// ─── Downstream Notification ─────────────────────────────────────

function notifyDownstream(
  node: TaskNode,
  updatedNodes: TaskNode[],
  outputs: Map<string, string>,
  downstreamMap: Map<string, string[]>,
  pendingInDegree: Map<string, number>,
  topoIndex: Map<string, number>,
  queue: string[],
) {
  for (const childId of downstreamMap.get(node.nodeId) ?? []) {
    const childNode = updatedNodes.find((n) => n.nodeId === childId);
    if (!childNode) continue;

    if (childNode.type === "decision") {
      if (!queue.includes(childId)) {
        queue.push(childId);
        queue.sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));
      }
    } else {
      const newDeg = (pendingInDegree.get(childId) ?? 1) - 1;
      pendingInDegree.set(childId, Math.max(0, newDeg));
      if (newDeg <= 0 && !queue.includes(childId)) {
        queue.push(childId);
        queue.sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));
      }
    }
  }
}

// ─── Loop-Back Handling ──────────────────────────────────────────

function handleLoopBack(
  decisionNodeId: string,
  downstreamMap: Map<string, string[]>,
  topoIndex: Map<string, number>,
  updatedNodes: TaskNode[],
  outputs: Map<string, string>,
  iterationCounts: Map<string, number>,
  queue: string[],
  edges: WorkflowEdge[],
) {
  const decisionTopoIdx = topoIndex.get(decisionNodeId) ?? -1;

  for (const childId of downstreamMap.get(decisionNodeId) ?? []) {
    const childTopoIdx = topoIndex.get(childId) ?? Infinity;

    if (childTopoIdx < decisionTopoIdx) {
      logger.info("execution", `Loop-back detected: Decision ${decisionNodeId.slice(0, 8)} → ${childId.slice(0, 8)} (re-iterating)`);

      const targetNode = updatedNodes.find((n) => n.nodeId === childId);
      if (targetNode) {
        targetNode.status = "pending";
        targetNode.outputCache = null;
        targetNode.executionHash = null;
        targetNode.wasCached = undefined;
      }
      outputs.delete(childId);
      resetPathToDecision(childId, decisionNodeId, updatedNodes, downstreamMap, outputs);

      if (!queue.includes(childId)) {
        queue.push(childId);
      }
    }
  }
}

function resetPathToDecision(
  startNodeId: string,
  decisionNodeId: string,
  updatedNodes: TaskNode[],
  downstreamMap: Map<string, string[]>,
  outputs: Map<string, string>,
) {
  const toReset = new Set<string>();
  const visitQueue = [startNodeId];

  while (visitQueue.length > 0) {
    const current = visitQueue.shift()!;
    if (current === decisionNodeId || toReset.has(current)) continue;
    toReset.add(current);
    for (const child of downstreamMap.get(current) ?? []) {
      if (child !== decisionNodeId && !toReset.has(child)) {
        visitQueue.push(child);
      }
    }
  }

  for (const nid of toReset) {
    const node = updatedNodes.find((n) => n.nodeId === nid);
    if (node && node.status === "completed") {
      node.status = "pending";
      node.outputCache = null;
      node.executionHash = null;
      node.wasCached = undefined;
    }
    outputs.delete(nid);
  }
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
      if ((src === "file" || src === "folder") && node.inputContent) {
        const label = src === "folder" ? "Folder" : "File";
        return `[${label}: ${node.inputPath ?? "unknown"}]\n${node.inputContent.slice(0, 2000)}${node.inputContent.length > 2000 ? "\n...(truncated)" : ""}`;
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
      const comfyParams = primaryAgent.provider === "comfyui"
        ? (node.data?.comfyuiParams as import("./llmService").ComfyUIParams | undefined)
        : undefined;

      // For ComfyUI, use upstream context directly as the image prompt
      const comfyPrompt = primaryAgent.provider === "comfyui" && context
        ? context
        : taskPrompt;
      return await llmService.call(primaryAgent, comfyPrompt, signal, nodeId, comfyParams);
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
