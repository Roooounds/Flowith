import { useState, useEffect } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import TaskChatPanel from "./TaskChatPanel";
import { hasFolderAccess, openProjectFolder } from "@/services/fileStorage";
import { parseOutput } from "@/services/outputParser";
import type { CollaborationMode } from "@/types/project";

const STATUS_KEYS = ["pending", "running", "completed", "error"] as const;

const FORMAT_KEYS = ["auto", "text", "markdown", "csv", "code", "image"] as const;

const MODE_OPTIONS: { value: CollaborationMode; icon: string }[] = [
  { value: "parallel", icon: "⇉" },
  { value: "sequential", icon: "→" },
  { value: "debate", icon: "↻" },
  { value: "critique", icon: "✓" },
];

function formatLabel(t: ReturnType<typeof useT>, fmt: string): string {
  switch (fmt) {
    case "auto": return t.nodeProps.formatAuto;
    case "text": return t.nodeProps.formatText;
    case "markdown": return t.nodeProps.formatMD;
    case "code": return t.nodeProps.formatCode;
    case "image": return t.nodeProps.formatImg;
    case "csv": return t.nodeProps.formatCSV;
    default: return fmt;
  }
}

function inputSourceLabel(t: ReturnType<typeof useT>, src: string): string {
  switch (src) {
    case "text": return t.nodeProps.inputSourceText;
    case "file": return t.nodeProps.inputSourceFile;
    case "url": return t.nodeProps.inputSourceUrl;
    default: return src;
  }
}

function typeBadgeText(t: ReturnType<typeof useT>, nodeType: string): string {
  switch (nodeType) {
    case "input": return t.nodeProps.typeBadgeInput;
    case "logic": return t.nodeProps.typeBadgeSummary;
    case "decision": return t.nodeProps.typeBadgeDecision;
    case "switch": return t.nodeProps.typeBadgeSwitch;
    case "loop": return t.nodeProps.typeBadgeLoop;
    case "output": return t.nodeProps.typeBadgeOutput;
    default: return nodeType;
  }
}

// ─── Rich output content renderer ─────────────────────────────────

function OutputContentRenderer({ content }: { content: string }) {
  const parsed = parseOutput(content);

  if (parsed.items.length === 0) {
    return (
      <pre className="p-3 rounded-lg bg-boss-bg border border-boss-border text-[11px] text-boss-text whitespace-pre-wrap leading-relaxed font-sans">
        {content}
      </pre>
    );
  }

  // Single image — full preview
  if (parsed.items.length === 1 && parsed.items[0].type === "image") {
    const img = parsed.items[0];
    return (
      <div className="rounded-lg overflow-hidden border border-boss-border bg-boss-bg">
        <img
          src={img.src}
          alt={img.alt || "Output image"}
          className="w-full h-auto max-h-96 object-contain"
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            el.style.display = "none";
          }}
        />
        <div className="px-3 py-2 flex items-center gap-2 border-t border-boss-border">
          <span className="text-sm">{parsed.icon}</span>
          <span className="text-[9px] text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded">{parsed.kind}</span>
          <a
            href={img.src}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[9px] text-boss-accent hover:underline"
          >
            Open original
          </a>
        </div>
      </div>
    );
  }

  // Single video
  if (parsed.items.length === 1 && parsed.items[0].type === "video") {
    const vid = parsed.items[0];
    return (
      <div className="rounded-lg overflow-hidden border border-boss-border bg-boss-bg">
        <video src={vid.src} controls className="w-full max-h-80" />
        <div className="px-3 py-2 flex items-center gap-2 border-t border-boss-border">
          <span className="text-sm">🎬</span>
          <span className="text-[9px] text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded">Video</span>
        </div>
      </div>
    );
  }

  // Multiple items or mixed content — render each item
  return (
    <div className="space-y-3">
      {parsed.items.map((item, i) => {
        switch (item.type) {
          case "image":
            return (
              <div key={i} className="rounded-lg overflow-hidden border border-boss-border bg-boss-bg">
                <img
                  src={item.src}
                  alt={item.alt || "Image"}
                  className="w-full h-auto max-h-80 object-contain"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    el.style.display = "none";
                  }}
                />
                <div className="px-3 py-1.5 flex items-center gap-2 border-t border-boss-border/50">
                  <span className="text-[10px] text-boss-text-muted/60 truncate">{item.alt || item.src?.split("/").pop()}</span>
                </div>
              </div>
            );
          case "video":
            return (
              <div key={i} className="rounded-lg overflow-hidden border border-boss-border bg-boss-bg">
                <video src={item.src} controls className="w-full max-h-80" />
              </div>
            );
          case "code":
            return (
              <div key={i} className="rounded-lg border border-violet-500/20 bg-violet-500/5 overflow-hidden">
                {item.language && (
                  <div className="px-3 py-1.5 border-b border-violet-500/10 flex items-center gap-2">
                    <span className="text-[10px] text-violet-400/70 font-mono uppercase">{item.language}</span>
                  </div>
                )}
                <pre className="p-3 text-[11px] text-boss-text font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {item.content}
                </pre>
              </div>
            );
          case "json":
            return (
              <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                <div className="px-3 py-1.5 border-b border-amber-500/10 flex items-center gap-2">
                  <span className="text-[10px] text-amber-400/70 font-mono uppercase">JSON</span>
                </div>
                <pre className="p-3 text-[11px] text-boss-text font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {(() => {
                    try { return JSON.stringify(JSON.parse(item.content), null, 2); } catch { return item.content; }
                  })()}
                </pre>
              </div>
            );
          case "markdown":
            return (
              <div key={i} className="rounded-lg border border-boss-border bg-boss-bg p-3">
                <pre className="text-[11px] text-boss-text font-sans whitespace-pre-wrap leading-relaxed">
                  {item.content}
                </pre>
              </div>
            );
          case "file":
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/15">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-boss-text font-medium truncate">{item.filename}</p>
                  <p className="text-[9px] text-boss-text-muted/50 truncate">{item.src}</p>
                </div>
                <a
                  href={item.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[10px] px-2.5 py-1 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
                >
                  Download
                </a>
              </div>
            );
          default:
            return (
              <pre key={i} className="p-3 rounded-lg bg-boss-bg border border-boss-border text-[11px] text-boss-text whitespace-pre-wrap leading-relaxed font-sans">
                {item.content}
              </pre>
            );
        }
      })}
      {/* Type summary bar */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm">{parsed.icon}</span>
        <span className="text-[9px] text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded">{parsed.kind}</span>
        <span className="text-[9px] text-boss-text-muted/40">{parsed.items.length} item{parsed.items.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

export default function NodePropertiesPanel() {
  const project = useProjectStore((s) => s.project);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const setSelectedNode = useProjectStore((s) => s.setSelectedNode);
  const updateNode = useProjectStore((s) => s.updateNode);
  const removeNode = useProjectStore((s) => s.removeNode);
  const isRunning = useProjectStore((s) => s.isRunning);
  const runWorkflowFromNode = useProjectStore((s) => s.runWorkflowFromNode);
  const rolePickerNodeId = useProjectStore((s) => s.rolePickerNodeId);
  const openRolePicker = useProjectStore((s) => s.openRolePicker);
  const t = useT();

  const node = project?.workflow.nodes.find((n) => n.nodeId === selectedNodeId);
  const agents = project?.agents ?? [];
  const autoOpenRolePicker = rolePickerNodeId === selectedNodeId;

  if (!node) {
    return (
      <aside className="w-72 shrink-0 bg-boss-surface border-l border-boss-border flex items-center justify-center">
        <p className="text-xs text-boss-text-muted">{t.nodeProps.selectNode}</p>
      </aside>
    );
  }

  const typeLabel =
    node.type === "input" ? t.nodeProps.inputNode
    : node.type === "logic" ? t.nodeProps.logicNode
    : node.type === "decision" ? t.nodeProps.decisionNode
    : node.type === "switch" ? t.nodeProps.switchNode
    : node.type === "loop" ? t.nodeProps.loopNode
    : node.type === "output" ? t.nodeProps.outputNode
    : t.nodeProps.taskNode;

  const statusLabel = (t.nodeProps as unknown as Record<string, string>)[node.status] ?? node.status;

  const statusColor =
    node.status === "completed" ? "text-boss-success"
    : node.status === "running" ? "text-boss-warning"
    : node.status === "error" ? "text-boss-error"
    : "text-boss-text-muted";

  const isTask = node.type === "task";
  const isOutput = node.type === "output";

  // Three-tier width: Task needs chat space, Output is medium, Input/Logic/Decision are compact
  const panelWidth = isTask ? "w-[30rem]" : isOutput ? "w-[26rem]" : "w-80";

  const assignedAgent = isTask
    ? agents.find((a) => node.agentIds.includes(a.agentId)) ?? null
    : null;

  const handleApplyOutput = (output: string) => {
    updateNode(node.nodeId, {
      outputCache: output,
      status: "completed",
      wasCached: false,
    } as any);
  };

  const handleApplyAndRerun = async (output: string) => {
    updateNode(node.nodeId, {
      outputCache: output,
      status: "completed",
      wasCached: false,
    } as any);

    if (!isRunning && project) {
      setTimeout(() => {
        const state = useProjectStore.getState();
        if (!state.isRunning && state.project) {
          state.runWorkflowFromNode(node.nodeId);
        }
      }, 100);
    }
  };

  const handleDiscard = () => {};

  return (
    <aside
      className={`shrink-0 min-w-0 bg-boss-surface border-l border-boss-border flex flex-col overflow-hidden transition-all duration-300 ${
        panelWidth
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-boss-border shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-boss-text truncate">{typeLabel}</h2>
          <p className={`text-[11px] ${statusColor} font-medium mt-0.5`}>{statusLabel}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(isTask || isOutput) && (
            <button
              onClick={() => removeNode(node.nodeId)}
              className="p-1 rounded hover:bg-boss-surface-hover text-boss-text-muted hover:text-boss-error transition-colors"
              title={t.nodeProps.deleteTooltip}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setSelectedNode(null)}
            className="p-1 rounded hover:bg-boss-surface-hover text-boss-text-muted hover:text-boss-text transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Task node ──────────────────────────────────────────────── */}
      {isTask ? (
        <>
          <div className="shrink-0 px-4 py-3 space-y-3 border-b border-boss-border/50">
            <div>
              <label className="block text-[10px] font-medium text-boss-text-muted mb-1">
                {t.nodeProps.instruction}
              </label>
              <textarea
                value={node.instruction}
                onChange={(e) => updateNode(node.nodeId, { instruction: e.target.value })}
                placeholder={t.nodeProps.instructionPlaceholder}
                rows={2}
                className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-sm text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors resize-none"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] font-medium text-boss-text-muted mb-1">
                  {t.nodeProps.assignedAgent}
                </label>
                <RolePicker
                  agents={agents}
                  selectedIds={node.agentIds}
                  onChange={(ids) => updateNode(node.nodeId, { agentIds: ids })}
                  noAgents={t.nodeProps.noAgents}
                  autoOpen={autoOpenRolePicker}
                  onOpened={() => openRolePicker(null)}
                />
              </div>
              <div className="w-24 shrink-0">
                <label className="block text-[10px] font-medium text-boss-text-muted mb-1">
                  {t.nodeProps.formatLabel}
                </label>
                <select
                  value={node.outputFormat ?? "auto"}
                  onChange={(e) => updateNode(node.nodeId, { outputFormat: e.target.value as any })}
                  className="w-full px-2 py-2 bg-boss-bg border border-boss-border rounded-lg text-[11px] text-boss-text focus:outline-none focus:border-boss-accent"
                >
                  {FORMAT_KEYS.map((fmt) => (
                    <option key={fmt} value={fmt}>
                      {formatLabel(t, fmt)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Collaboration mode — compact */}
            {node.agentIds.length > 1 && (
              <div className="px-3 pb-2">
                <div className="flex gap-1 flex-wrap">
                  {MODE_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => updateNode(node.nodeId, { collaborationMode: m.value })}
                      title={t.nodeProps.modeDesc?.[m.value] ?? m.value}
                      className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                        (node.collaborationMode ?? "parallel") === m.value
                          ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30"
                          : "border border-boss-border text-boss-text-muted hover:text-boss-text"
                      }`}
                    >
                      {m.icon}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ComfyUI image generation params */}
            {assignedAgent?.provider === "comfyui" && (() => {
              const cp = (node.data?.comfyuiParams ?? {}) as Record<string, any>;
              const setComfy = (k: string, v: any) => {
                updateNode(node.nodeId, {
                  data: { ...node.data, comfyuiParams: { ...cp, [k]: v } },
                });
              };
              const hasWorkflow = !!cp.workflowJson;
              return (
                <div className="px-3 pb-3 space-y-2 border-b border-boss-border/50">
                  <p className="text-[10px] font-semibold text-boss-text uppercase tracking-wider">🎨 ComfyUI Settings</p>
                  {/* Workflow file upload */}
                  <div className="flex items-center gap-2">
                    <label className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-boss-border hover:border-boss-accent/50 cursor-pointer transition-colors text-[10px] text-boss-text-muted">
                      <input type="file" accept=".json" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const text = await file.text();
                        setComfy("workflowJson", text);
                        setComfy("_workflowName", file.name);
                      }} />
                      <svg className="w-3.5 h-3.5 text-boss-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <span className="truncate">{cp._workflowName || "Load workflow .json from ComfyUI..."}</span>
                    </label>
                    {hasWorkflow && (
                      <button onClick={() => { setComfy("workflowJson", null); setComfy("_workflowName", null); }}
                        className="text-[9px] text-boss-error hover:text-boss-error/80 shrink-0">Clear</button>
                    )}
                  </div>
                  {/* Basic params when NO workflow loaded */}
                  {!hasWorkflow && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] text-boss-text-muted mb-0.5">Width</label>
                          <select value={cp.width ?? 512} onChange={e => setComfy("width", Number(e.target.value))}
                            className="w-full px-1.5 py-1 bg-boss-bg border border-boss-border rounded text-[10px] text-boss-text">
                            {[256, 384, 512, 640, 768, 896, 1024].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] text-boss-text-muted mb-0.5">Height</label>
                          <select value={cp.height ?? 512} onChange={e => setComfy("height", Number(e.target.value))}
                            className="w-full px-1.5 py-1 bg-boss-bg border border-boss-border rounded text-[10px] text-boss-text">
                            {[256, 384, 512, 640, 768, 896, 1024].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] text-boss-text-muted mb-0.5">Steps</label>
                          <select value={cp.steps ?? 20} onChange={e => setComfy("steps", Number(e.target.value))}
                            className="w-full px-1.5 py-1 bg-boss-bg border border-boss-border rounded text-[10px] text-boss-text">
                            {[8, 12, 16, 20, 25, 30, 40, 50].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] text-boss-text-muted mb-0.5">CFG Scale</label>
                          <select value={cp.cfg_scale ?? 7} onChange={e => setComfy("cfg_scale", Number(e.target.value))}
                            className="w-full px-1.5 py-1 bg-boss-bg border border-boss-border rounded text-[10px] text-boss-text">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] text-boss-text-muted mb-0.5">Seed (-1=random)</label>
                          <input type="number" value={cp.seed ?? -1} onChange={e => setComfy("seed", Number(e.target.value))}
                            className="w-full px-1.5 py-1 bg-boss-bg border border-boss-border rounded text-[10px] text-boss-text" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] text-boss-text-muted mb-0.5">Negative Prompt</label>
                        <textarea value={cp.negative_prompt ?? ""} onChange={e => setComfy("negative_prompt", e.target.value)}
                          rows={2} placeholder="bad quality, blurry, distorted..."
                          className="w-full px-2 py-1.5 bg-boss-bg border border-boss-border rounded text-[10px] text-boss-text placeholder:text-boss-text-muted/30 resize-none" />
                      </div>
                    </>
                  )}
                  {hasWorkflow && (
                    <div className="space-y-1">
                      <p className="text-[9px] text-boss-success/70">✓ Custom workflow loaded</p>
                      <div className="text-[9px] text-boss-text-muted bg-boss-bg/50 rounded p-1.5 leading-relaxed">
                        <span className="text-boss-accent">Tip:</span> In your workflow's CLIPTextEncode node, write <code className="bg-boss-bg px-0.5 rounded text-boss-text">{"{{prompt}}"}</code> to inject upstream text. Without markers, the system auto-injects into the first positive prompt node.
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <TaskChatPanel
              nodeId={node.nodeId}
              agent={assignedAgent}
              instruction={node.instruction}
              currentOutput={node.outputCache}
              onApplyOutput={handleApplyOutput}
              onApplyAndRerunDownstream={handleApplyAndRerun}
              onDiscard={handleDiscard}
            />
          </div>
        </>

      /* ── Output node ────────────────────────────────────────────── */
      ) : isOutput ? (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                {typeBadgeText(t, node.type)}
              </span>
              <span className="text-[10px] text-boss-text-muted/50 font-mono">{node.nodeId.slice(0, 8)}</span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-boss-text-muted mb-2">{t.nodeProps.outputContent}</label>
              {node.outputCache ? (
                <OutputContentRenderer content={node.outputCache} />
              ) : (
                <div className="p-4 rounded-lg bg-boss-bg border border-boss-border text-center">
                  <p className="text-[11px] text-boss-text-muted">{t.nodeProps.outputEmpty}</p>
                  <p className="text-[10px] text-boss-text-muted/50 mt-1">{t.nodeProps.outputEmptyHint}</p>
                </div>
              )}
            </div>

            {node.outputCache && hasFolderAccess() && (
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📁</span>
                    <div>
                      <p className="text-[10px] text-boss-text font-medium">{t.nodeProps.savedToFolder}</p>
                      <p className="text-[9px] text-boss-text-muted/50">{t.nodeProps.savedFileLocation}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => openProjectFolder()}
                    className="text-[9px] px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                  >
                    {t.nodeProps.openFolder}
                  </button>
                </div>
              </div>
            )}

            {node.saved && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs">🔒</span>
                <span className="text-[10px] text-boss-text-muted">{t.nodeProps.outputLocked}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-boss-text-muted mb-1">{t.nodeProps.status}</label>
              <div className="flex gap-1">
                {STATUS_KEYS.map((s) => (
                  <span key={s}
                    className={`flex-1 py-1.5 text-[10px] rounded-md text-center ${node.status === s ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30" : "border border-boss-border text-boss-text-muted/30"}`}
                  >
                    {t.nodeProps[s]}
                  </span>
                ))}
              </div>
            </div>

            {node.status === "error" && node.errorDetail && (
              <div className={`p-3 rounded-lg border ${
                node.errorDetail.severity === "critical" ? "bg-red-600/10 border-red-600/30"
                : node.errorDetail.severity === "warning" ? "bg-yellow-500/10 border-yellow-500/20"
                : "bg-boss-error/10 border-boss-error/20"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                    node.errorDetail.severity === "critical" ? "bg-red-600/20 text-red-400"
                    : node.errorDetail.severity === "warning" ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-boss-error/20 text-boss-error"
                  }`}>
                    {node.errorDetail.severity}
                  </span>
                  <span className="text-[9px] font-mono text-boss-text-muted">{node.errorDetail.errorCode}</span>
                </div>
                <p className="text-[11px] text-boss-text font-medium mb-1">{node.errorDetail.message}</p>
                <p className="text-[10px] text-boss-text-muted leading-relaxed">{node.errorDetail.suggestion}</p>
                {node.errorDetail.recoverable && (
                  <p className="text-[9px] text-boss-success mt-2">{t.nodeProps.recoverableError}</p>
                )}
                {!node.errorDetail.recoverable && (
                  <p className="text-[9px] text-boss-error mt-2">{t.nodeProps.nonRecoverableError}</p>
                )}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-boss-border shrink-0">
            <button onClick={() => removeNode(node.nodeId)} className="w-full py-2 rounded-lg border border-boss-error/30 text-xs text-boss-error hover:bg-boss-error/10 transition-colors">
              {t.nodeProps.deleteNode}
            </button>
          </div>
        </>

      /* ── Input / Logic / Decision nodes ─────────────────────────── */
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${
                node.type === "input" ? "bg-blue-500/10 text-blue-400"
                : node.type === "logic" ? "bg-purple-500/10 text-purple-400"
                : node.type === "decision" ? "bg-rose-500/10 text-rose-400"
                : node.type === "switch" ? "bg-violet-500/10 text-violet-400"
                : node.type === "loop" ? "bg-cyan-500/10 text-cyan-400"
                : "bg-boss-accent/10 text-boss-accent"
              }`}>{typeBadgeText(t, node.type)}</span>
              <span className="text-[10px] text-boss-text-muted/50 font-mono">{node.nodeId.slice(0, 8)}</span>
            </div>

            {node.type === "input" && (
              <div>
                <label className="block text-[11px] font-medium text-boss-text-muted mb-1">{t.nodeProps.inputSource}</label>
                <div className="grid grid-cols-3 gap-1 mb-3">
                  {(["text", "file", "url"] as const).map((src) => (
                    <button
                      key={src}
                      onClick={() => updateNode(node.nodeId, { inputSource: src, inputPath: undefined, inputContent: undefined, instruction: src === "text" ? node.instruction : "" })}
                      className={`py-1.5 text-[10px] rounded-md transition-colors ${(node.inputSource ?? "text") === src ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30" : "border border-boss-border text-boss-text-muted hover:text-boss-text"}`}
                    >
                      {inputSourceLabel(t, src)}
                    </button>
                  ))}
                </div>
                {(node.inputSource ?? "text") === "file" && (
                  <div className="mb-3">
                    <label className="relative w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-boss-border hover:border-boss-accent/50 cursor-pointer transition-colors">
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const content = reader.result as string;
                          updateNode(node.nodeId, { inputPath: file.name, inputContent: content.split(",")[1] ?? content });
                        };
                        reader.readAsDataURL(file);
                      }} />
                      <svg className="w-4 h-4 text-boss-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                      <span className="text-[10px] text-boss-text-muted">{node.inputPath || t.nodeProps.clickToSelectFile}</span>
                    </label>
                  </div>
                )}
                {(node.inputSource ?? "text") === "url" && (
                  <div className="mb-3">
                    <input type="url" value={node.inputPath ?? ""} onChange={(e) => updateNode(node.nodeId, { inputPath: e.target.value })} placeholder={t.nodeProps.urlPlaceholder} className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-sm font-mono text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors" />
                  </div>
                )}
              </div>
            )}

            {(node.type !== "input" || (node.inputSource ?? "text") === "text") && (
              <div>
                <label className="block text-[11px] font-medium text-boss-text-muted mb-1">{t.nodeProps.instruction}</label>
                <textarea value={node.instruction} onChange={(e) => updateNode(node.nodeId, { instruction: e.target.value })} placeholder={t.nodeProps.instructionPlaceholder} rows={4} className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-sm text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors resize-none" />
              </div>
            )}

            {/* Switch branch editor */}
            {node.type === "switch" && (
              <div>
                <label className="block text-[11px] font-medium text-boss-text-muted mb-1">Branches</label>
                <div className="space-y-1">
                  {(node.switchBranches ?? ["branch_1", "branch_2"]).map((branch, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <input
                        type="text"
                        value={branch}
                        onChange={(e) => {
                          const branches = [...(node.switchBranches ?? ["branch_1", "branch_2"])];
                          branches[i] = e.target.value;
                          updateNode(node.nodeId, { switchBranches: branches } as any);
                        }}
                        className="flex-1 px-2 py-1.5 bg-boss-bg border border-boss-border rounded text-[11px] text-boss-text focus:outline-none focus:border-violet-400/50"
                      />
                      <button
                        onClick={() => {
                          const branches = [...(node.switchBranches ?? [])];
                          branches.splice(i, 1);
                          updateNode(node.nodeId, { switchBranches: branches } as any);
                        }}
                        className="p-1 rounded hover:bg-boss-error/10 text-boss-text-muted hover:text-boss-error"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const branches = [...(node.switchBranches ?? ["branch_1", "branch_2"]), `branch_${(node.switchBranches?.length ?? 2) + 1}`];
                      updateNode(node.nodeId, { switchBranches: branches } as any);
                    }}
                    className="w-full py-1 rounded border border-dashed border-boss-border hover:border-violet-400/50 text-[10px] text-boss-text-muted hover:text-violet-400 transition-colors"
                  >
                    + Add Branch
                  </button>
                </div>
              </div>
            )}

            {/* Loop config */}
            {node.type === "loop" && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-medium text-boss-text-muted mb-1">Max Iterations</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={node.loopConfig?.maxIterations ?? 5}
                    onChange={(e) => updateNode(node.nodeId, { loopConfig: { ...node.loopConfig!, maxIterations: parseInt(e.target.value) || 1 } } as any)}
                    className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-sm text-boss-text focus:outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-boss-text-muted mb-1">Exit Condition</label>
                  <input
                    type="text"
                    value={node.loopConfig?.condition ?? ""}
                    onChange={(e) => updateNode(node.nodeId, { loopConfig: { ...node.loopConfig!, condition: e.target.value } } as any)}
                    placeholder="e.g. All characters have resolved arcs"
                    className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-sm text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-cyan-400/50"
                  />
                </div>
              </div>
            )}

            {node.type !== "output" && (
              <div>
                <label className="block text-[11px] font-medium text-boss-text-muted mb-1.5">{t.nodeProps.assignedAgent}</label>
                <RolePicker
                  agents={agents}
                  selectedIds={node.agentIds}
                  onChange={(ids) => updateNode(node.nodeId, { agentIds: ids })}
                  noAgents={t.nodeProps.noAgents}
                  autoOpen={autoOpenRolePicker}
                  onOpened={() => openRolePicker(null)}
                />
              </div>
            )}

            {/* Collaboration mode — only for task nodes with multiple agents */}
            {node.type === "task" && node.agentIds.length > 1 && (
              <div>
                <label className="block text-[11px] font-medium text-boss-text-muted mb-1.5">
                  {t.nodeProps.collaborationMode || "Collaboration Mode"}
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {MODE_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => updateNode(node.nodeId, { collaborationMode: m.value })}
                      title={t.nodeProps.modeDesc?.[m.value] ?? m.value}
                      className={`py-1.5 px-2 text-[10px] rounded-md transition-colors text-left ${
                        (node.collaborationMode ?? "parallel") === m.value
                          ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30"
                          : "border border-boss-border text-boss-text-muted hover:text-boss-text"
                      }`}
                    >
                      <span className="mr-1">{m.icon}</span>
                      {t.nodeProps.modeLabel?.[m.value] ?? m.value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {node.type === "task" && (
              <div>
                <label className="block text-[11px] font-medium text-boss-text-muted mb-1">{t.nodeProps.outputFormat}</label>
                <div className="grid grid-cols-3 gap-1">
                  {FORMAT_KEYS.map((fmt) => (
                    <button key={fmt} onClick={() => updateNode(node.nodeId, { outputFormat: fmt })}
                      className={`py-1.5 text-[10px] rounded-md transition-colors ${(node.outputFormat ?? "auto") === fmt ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30" : "border border-boss-border text-boss-text-muted hover:text-boss-text"}`}
                    >
                      {formatLabel(t, fmt)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-boss-text-muted mb-1">{t.nodeProps.status}</label>
              <div className="flex gap-1">
                {STATUS_KEYS.map((s) => (
                  <span key={s}
                    className={`flex-1 py-1.5 text-[10px] rounded-md text-center ${node.status === s ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30" : "border border-boss-border text-boss-text-muted/30"}`}
                  >
                    {t.nodeProps[s]}
                  </span>
                ))}
              </div>
            </div>

            {node.status === "error" && node.errorDetail && (
              <div className={`p-3 rounded-lg border ${
                node.errorDetail.severity === "critical" ? "bg-red-600/10 border-red-600/30"
                : node.errorDetail.severity === "warning" ? "bg-yellow-500/10 border-yellow-500/20"
                : "bg-boss-error/10 border-boss-error/20"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                    node.errorDetail.severity === "critical" ? "bg-red-600/20 text-red-400"
                    : node.errorDetail.severity === "warning" ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-boss-error/20 text-boss-error"
                  }`}>
                    {node.errorDetail.severity}
                  </span>
                  <span className="text-[9px] font-mono text-boss-text-muted">{node.errorDetail.errorCode}</span>
                </div>
                <p className="text-[11px] text-boss-text font-medium mb-1">{node.errorDetail.message}</p>
                <p className="text-[10px] text-boss-text-muted leading-relaxed">{node.errorDetail.suggestion}</p>
                {node.errorDetail.recoverable && (
                  <p className="text-[9px] text-boss-success mt-2">{t.nodeProps.recoverableError}</p>
                )}
                {!node.errorDetail.recoverable && (
                  <p className="text-[9px] text-boss-error mt-2">{t.nodeProps.nonRecoverableError}</p>
                )}
              </div>
            )}

            {node.executionHash && (
              <div>
                <label className="block text-[11px] font-medium text-boss-text-muted mb-1">{t.nodeProps.execHash}</label>
                <p className="text-[10px] text-boss-text-muted/50 font-mono break-all">{node.executionHash}</p>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-boss-border shrink-0">
            <button onClick={() => removeNode(node.nodeId)} className="w-full py-2 rounded-lg border border-boss-error/30 text-xs text-boss-error hover:bg-boss-error/10 transition-colors">
              {t.nodeProps.deleteNode}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

// ─── Unified Role Picker (multi-select, all node types) ───────────

function RolePicker({ agents, selectedIds, onChange, noAgents, autoOpen, onOpened }: {
  agents: { agentId: string; name: string; avatarEmoji?: string; modelName: string; category?: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  noAgents: string;
  autoOpen?: boolean;
  onOpened?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  useEffect(() => {
    if (autoOpen && !open) {
      const timer = setTimeout(() => { setOpen(true); onOpened?.(); }, 50);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  const assigned = agents.filter((a) => selectedIds.includes(a.agentId));
  const cats = [...new Set(agents.map((a) => a.category).filter(Boolean))] as string[];

  const toggleAgent = (agentId: string) => {
    if (selectedIds.includes(agentId)) {
      onChange(selectedIds.filter((id) => id !== agentId));
    } else {
      onChange([...selectedIds, agentId]);
    }
  };

  const filtered = agents.filter((a) => {
    if (q) {
      const lq = q.toLowerCase();
      if (!a.name.toLowerCase().includes(lq) && !a.modelName.toLowerCase().includes(lq) && !(a.category?.toLowerCase().includes(lq))) return false;
    }
    if (cat && a.category !== cat) return false;
    return true;
  });

  return (
    <div>
      {assigned.length > 0 && (
        <div className="space-y-1">
          {assigned.map((a) => (
            <div key={a.agentId} className="flex items-center gap-1.5 px-2 py-1 rounded border border-boss-border bg-boss-bg">
              <span className="text-base shrink-0">{a.avatarEmoji || "👤"}</span>
              <span className="text-[10px] text-boss-text truncate flex-1">{a.name}</span>
              <button onClick={() => toggleAgent(a.agentId)} className="p-0.5 rounded hover:bg-boss-error/10 text-boss-text-muted hover:text-boss-error shrink-0">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-boss-border hover:border-boss-accent bg-boss-bg text-left transition-colors w-full ${assigned.length > 0 ? "mt-1.5" : ""}`}
      >
        <span className="text-[11px] text-boss-text-muted/50">{t.nodeProps.assign}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
          <div className="panel w-80 max-h-[28rem] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-boss-border shrink-0">
              <span className="text-[11px] font-semibold text-boss-text">{t.nodeProps.selectRoles}</span>
              <button onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-boss-surface-hover text-boss-text-muted">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-2 pt-2 space-y-1.5 shrink-0">
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t.nodeProps.searchRoles}
                className="w-full px-2 py-1.5 bg-boss-bg border border-boss-border rounded-lg text-[11px] text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors" />
              {cats.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setCat(null)} className={`px-2 py-0.5 text-[9px] rounded-full ${!cat ? "bg-boss-accent/15 text-boss-accent" : "bg-boss-border/20 text-boss-text-muted hover:text-boss-text"}`}>{t.nodeProps.all}</button>
                  {cats.map((c) => (
                    <button key={c} onClick={() => setCat(c === cat ? null : c)} className={`px-2 py-0.5 text-[9px] rounded-full ${c === cat ? "bg-boss-accent/15 text-boss-accent" : "bg-boss-border/20 text-boss-text-muted hover:text-boss-text"}`}>{c}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {agents.length === 0 && <p className="text-[10px] text-boss-text-muted text-center py-4">{noAgents}</p>}
              {assigned.length > 0 && (
                <button onClick={() => { onChange([]); setOpen(false); }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg border border-boss-error/20 hover:bg-boss-error/5 transition-colors text-left">
                  <span className="text-sm">✕</span>
                  <span className="text-[10px] text-boss-error">{t.nodeProps.unassign}</span>
                </button>
              )}
              {filtered.map((a) => (
                <button key={a.agentId} onClick={() => toggleAgent(a.agentId)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg border transition-colors text-left ${
                    selectedIds.includes(a.agentId)
                      ? "border-boss-accent/30 bg-boss-accent/5"
                      : "border-boss-border hover:border-boss-border-active hover:bg-boss-surface-hover"
                  }`}>
                  {a.avatarEmoji?.startsWith("data:") ? (
                    <img src={a.avatarEmoji} className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="text-lg shrink-0">{a.avatarEmoji || "👤"}</span>
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-boss-text truncate">{a.name}</p>
                    <p className="text-[9px] text-boss-text-muted/50 truncate">{a.modelName}</p>
                  </div>
                  {selectedIds.includes(a.agentId) && (
                    <svg className="w-3.5 h-3.5 text-boss-accent shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
