/**
 * Structured logger for Flowith — ring-buffered, category-tagged, exportable.
 * Provides per-node timing, LLM call tracking, cache metrics, and error counting.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogCategory = "execution" | "llm" | "cache" | "error" | "kb" | "system";

export interface LogEntry {
  /** Monotonic sequence number */
  seq: number;
  /** ISO 8601 timestamp */
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  /** Optional structured metadata */
  meta?: Record<string, unknown>;
}

export interface ExecutionMetrics {
  /** Node execution timing: nodeId → duration_ms */
  nodeTiming: Record<string, number>;
  /** Total LLM calls per node */
  llmCalls: Record<string, number>;
  /** Cache hits per node */
  cacheHits: Record<string, number>;
  /** Cache misses (fresh executions) per node */
  cacheMisses: Record<string, number>;
  /** Error counts grouped by error code */
  errorsByCode: Record<string, number>;
  /** Total workflow runs */
  totalRuns: number;
  /** Session start time */
  sessionStart: string;
}

const MAX_ENTRIES = 500;
const ring: LogEntry[] = [];
let seq = 0;

/** Current session metrics — reset on each run */
let currentMetrics: ExecutionMetrics = blankMetrics();

function blankMetrics(): ExecutionMetrics {
  return {
    nodeTiming: {},
    llmCalls: {},
    cacheHits: {},
    cacheMisses: {},
    errorsByCode: {},
    totalRuns: 0,
    sessionStart: new Date().toISOString(),
  };
}

// ─── Core logging ──────────────────────────────────────────────────

function push(level: LogLevel, category: LogCategory, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    seq: seq++,
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    meta,
  };
  ring.push(entry);
  if (ring.length > MAX_ENTRIES) ring.shift();

  // Also echo to console in dev
  if (import.meta.env.DEV) {
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[${category}] ${message}`, meta ?? "");
  }
}

export const logger = {
  debug(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    push("debug", category, message, meta);
  },
  info(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    push("info", category, message, meta);
  },
  warn(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    push("warn", category, message, meta);
  },
  error(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    push("error", category, message, meta);
  },
};

// ─── Metrics ───────────────────────────────────────────────────────

export const metrics = {
  /** Reset for a new workflow run */
  resetRun() {
    currentMetrics = blankMetrics();
  },

  /** Record node execution timing */
  recordNodeTiming(nodeId: string, durationMs: number) {
    currentMetrics.nodeTiming[nodeId] = durationMs;
  },

  /** Record LLM call for a node */
  recordLlmCall(nodeId: string) {
    currentMetrics.llmCalls[nodeId] = (currentMetrics.llmCalls[nodeId] ?? 0) + 1;
  },

  /** Record cache hit */
  recordCacheHit(nodeId: string) {
    currentMetrics.cacheHits[nodeId] = (currentMetrics.cacheHits[nodeId] ?? 0) + 1;
  },

  /** Record cache miss (fresh execution) */
  recordCacheMiss(nodeId: string) {
    currentMetrics.cacheMisses[nodeId] = (currentMetrics.cacheMisses[nodeId] ?? 0) + 1;
  },

  /** Record an error by code */
  recordError(code: string) {
    currentMetrics.errorsByCode[code] = (currentMetrics.errorsByCode[code] ?? 0) + 1;
  },

  /** Increment total run count */
  recordRun() {
    currentMetrics.totalRuns++;
  },

  /** Get current metrics snapshot */
  snapshot(): ExecutionMetrics {
    return { ...currentMetrics, nodeTiming: { ...currentMetrics.nodeTiming }, llmCalls: { ...currentMetrics.llmCalls }, cacheHits: { ...currentMetrics.cacheHits }, cacheMisses: { ...currentMetrics.cacheMisses }, errorsByCode: { ...currentMetrics.errorsByCode } };
  },
};

// ─── Query ─────────────────────────────────────────────────────────

export function getLogs(filter?: {
  level?: LogLevel;
  category?: LogCategory;
  limit?: number;
}): LogEntry[] {
  let entries = [...ring];
  if (filter?.level) entries = entries.filter((e) => e.level === filter.level);
  if (filter?.category) entries = entries.filter((e) => e.category === filter.category);
  return entries.slice(-(filter?.limit ?? 100));
}

export function exportLogs(format: "json" | "csv" = "json"): string {
  const entries = getLogs();
  if (format === "csv") {
    const header = "seq,timestamp,level,category,message,meta\n";
    return header + entries.map((e) =>
      `${e.seq},"${e.timestamp}","${e.level}","${e.category}","${e.message.replace(/"/g, '""')}","${JSON.stringify(e.meta ?? {}).replace(/"/g, '""')}"`
    ).join("\n");
  }
  return JSON.stringify(entries, null, 2);
}

// ─── Convenience helpers ───────────────────────────────────────────

let executionStartTime: Map<string, number> = new Map();

export function startNodeTimer(nodeId: string) {
  executionStartTime.set(nodeId, performance.now());
}

export function endNodeTimer(nodeId: string) {
  const start = executionStartTime.get(nodeId);
  if (start !== undefined) {
    const duration = Math.round(performance.now() - start);
    metrics.recordNodeTiming(nodeId, duration);
    logger.info("execution", `Node ${nodeId.slice(0, 8)} completed in ${duration}ms`, { nodeId, durationMs: duration });
    executionStartTime.delete(nodeId);
    return duration;
  }
  return null;
}

export function clearLogs() {
  ring.length = 0;
  seq = 0;
}
