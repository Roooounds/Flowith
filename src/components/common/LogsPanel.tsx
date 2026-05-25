import { useState, useEffect, useMemo, useCallback } from "react";
import { getLogs, exportLogs, clearLogs, metrics, type LogEntry, type LogLevel, type LogCategory } from "@/services/loggerService";

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "bg-boss-border text-boss-text-muted",
  info: "bg-blue-500/20 text-blue-400",
  warn: "bg-amber-500/20 text-amber-400",
  error: "bg-red-500/20 text-red-400",
};

const CATEGORY_LABELS: Record<LogCategory, string> = {
  execution: "Exec",
  llm: "LLM",
  cache: "Cache",
  error: "Err",
  kb: "KB",
  system: "Sys",
};

const ALL_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const ALL_CATEGORIES: LogCategory[] = ["execution", "llm", "cache", "error", "kb", "system"];

export default function LogsPanel() {
  const [tick, setTick] = useState(0);
  const [levelFilter, setLevelFilter] = useState<LogLevel | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<LogCategory | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Auto-refresh every 2 seconds
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const entries = useMemo(() => {
    return getLogs({
      level: levelFilter ?? undefined,
      category: categoryFilter ?? undefined,
    });
  }, [tick, levelFilter, categoryFilter]);

  const snap = useMemo(() => metrics.snapshot(), [tick]);

  const cacheHitCount = Object.values(snap.cacheHits).reduce((a, b) => a + b, 0);
  const cacheMissCount = Object.values(snap.cacheMisses).reduce((a, b) => a + b, 0);
  const cacheTotal = cacheHitCount + cacheMissCount;
  const cacheHitRate = cacheTotal > 0 ? Math.round((cacheHitCount / cacheTotal) * 100) : null;

  const timings = Object.values(snap.nodeTiming);
  const avgTime = timings.length > 0 ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) : null;

  const errorTotal = Object.values(snap.errorsByCode).reduce((a, b) => a + b, 0);

  const handleExport = useCallback((format: "json" | "csv") => {
    const content = exportLogs(format);
    const mime = format === "json" ? "application/json" : "text/csv";
    const ext = format === "json" ? "json" : "csv";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowith-logs-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, []);

  const handleClear = useCallback(() => {
    clearLogs();
    setTick(t => t + 1);
  }, []);

  return (
    <div className="space-y-4">
      {/* ── Metrics Summary ── */}
      <div className="grid grid-cols-4 gap-2">
        <MetricCard label="Runs" value={snap.totalRuns > 0 ? String(snap.totalRuns) : "—"} />
        <MetricCard
          label="Cache"
          value={cacheHitRate !== null ? `${cacheHitRate}%` : "—"}
          subtle={cacheHitRate !== null ? `${cacheHitCount}h / ${cacheMissCount}m` : undefined}
        />
        <MetricCard
          label="Avg Node"
          value={avgTime !== null ? `${(avgTime / 1000).toFixed(1)}s` : "—"}
        />
        <MetricCard
          label="Errors"
          value={errorTotal > 0 ? String(errorTotal) : "0"}
          warn={errorTotal > 0}
        />
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        {/* Level filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-boss-text-muted/60 w-8 shrink-0">Level</span>
          <button
            onClick={() => setLevelFilter(null)}
            className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
              levelFilter === null ? "bg-boss-accent/20 text-boss-accent" : "text-boss-text-muted hover:text-boss-text"
            }`}
          >
            All
          </button>
          {ALL_LEVELS.map(lv => (
            <button
              key={lv}
              onClick={() => setLevelFilter(lv)}
              className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                levelFilter === lv ? "bg-boss-accent/20 text-boss-accent" : "text-boss-text-muted hover:text-boss-text"
              }`}
            >
              {lv}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-boss-text-muted/60 w-8 shrink-0">Cat</span>
          <button
            onClick={() => setCategoryFilter(null)}
            className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
              categoryFilter === null ? "bg-boss-accent/20 text-boss-accent" : "text-boss-text-muted hover:text-boss-text"
            }`}
          >
            All
          </button>
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                categoryFilter === cat ? "bg-boss-accent/20 text-boss-accent" : "text-boss-text-muted hover:text-boss-text"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Log Entries ── */}
      <div className="rounded-lg border border-boss-border bg-boss-bg/70 overflow-hidden">
        <div className="max-h-64 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[10px] text-boss-text-muted/40">
                {snap.totalRuns === 0 ? "No logs yet. Run a workflow to see entries." : "No entries match the current filters."}
              </p>
            </div>
          ) : (
            <table className="w-full text-[10px] font-mono">
              <tbody>
                {entries.map(e => (
                  <tr key={e.seq} className="border-b border-boss-border/30 last:border-b-0 hover:bg-boss-surface-hover/50">
                    <td className="py-1.5 pl-3 pr-2 text-boss-text-muted/40 whitespace-nowrap w-[5.5rem]">
                      {e.timestamp.slice(11, 19)}
                    </td>
                    <td className="py-1.5 px-1 w-14">
                      <span className={`inline-block px-1.5 py-px rounded text-[8px] font-medium uppercase ${LEVEL_COLORS[e.level]}`}>
                        {e.level}
                      </span>
                    </td>
                    <td className="py-1.5 px-1 w-12">
                      <span className="text-boss-text-muted/40 text-[8px] uppercase">
                        {CATEGORY_LABELS[e.category]}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-boss-text/80 break-all leading-relaxed">
                      {e.message}
                      {e.meta && Object.keys(e.meta).length > 0 && (
                        <span className="text-boss-text-muted/30 ml-1">
                          {JSON.stringify(e.meta).slice(0, 80)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-boss-border bg-boss-bg/50">
          <span className="text-[9px] text-boss-text-muted/40">
            {entries.length} entries
          </span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(v => !v)}
                className="px-3 py-1 rounded border border-boss-border text-[9px] text-boss-text-muted hover:text-boss-text hover:border-boss-border-active transition-colors"
              >
                Export
              </button>
              {showExportMenu && (
                <div className="absolute bottom-full right-0 mb-1 rounded-lg border border-boss-border bg-boss-bg shadow-xl py-1 min-w-[100px] z-10">
                  <button onClick={() => handleExport("json")} className="block w-full text-left px-3 py-1.5 text-[9px] text-boss-text-muted hover:text-boss-text hover:bg-boss-surface-hover">
                    JSON (.json)
                  </button>
                  <button onClick={() => handleExport("csv")} className="block w-full text-left px-3 py-1.5 text-[9px] text-boss-text-muted hover:text-boss-text hover:bg-boss-surface-hover">
                    CSV (.csv)
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleClear}
              className="px-3 py-1 rounded border border-boss-error/30 text-[9px] text-boss-error hover:bg-boss-error/10 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, subtle, warn }: {
  label: string;
  value: string;
  subtle?: string;
  warn?: boolean;
}) {
  return (
    <div className="p-2 rounded-lg border border-boss-border bg-boss-bg/50 text-center">
      <p className={`text-sm font-semibold font-mono ${warn ? "text-boss-error" : "text-boss-text"}`}>
        {value}
      </p>
      <p className="text-[8px] text-boss-text-muted/50 uppercase tracking-wider">{label}</p>
      {subtle && <p className="text-[8px] text-boss-text-muted/30 mt-0.5">{subtle}</p>}
    </div>
  );
}
