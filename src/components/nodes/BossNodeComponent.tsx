import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import { useResize } from "@/hooks/useResize";
import AgentTooltip from "@/components/common/AgentTooltip";
import type { BossNodeData } from "@/types/canvas";

import type { NodeType } from "@/types/project";

const TYPE_CONFIG: Record<NodeType, { icon: JSX.Element; accent: string; handle: string }> = {
  input: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
      </svg>
    ),
    accent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    handle: "!bg-blue-400",
  },
  task: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    accent: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    handle: "!bg-amber-400",
  },
  logic: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    accent: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    handle: "!bg-purple-400",
  },
  decision: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
    accent: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    handle: "!bg-orange-400",
  },
  switch: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    accent: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    handle: "!bg-teal-400",
  },
  loop: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
      </svg>
    ),
    accent: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    handle: "!bg-pink-400",
  },
  output: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
    accent: "bg-green-500/10 text-green-400 border-green-500/20",
    handle: "!bg-green-400",
  },
};

const PLACEHOLDER_MAP: Record<NodeType, string> = {
  input: "defineInput",
  task: "describeTask",
  logic: "defineCondition",
  decision: "defineDecision",
  switch: "defineSwitch",
  loop: "defineLoop",
  output: "defineOutput",
};

const MODE_ICON: Record<string, string> = {
  parallel: "⇉",
  sequential: "→",
  debate: "↻",
  critique: "✓",
};

function BossNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as BossNodeData;
  const { label, nodeType, agentNames, agentAvatars, agentIds, collaborationMode, status, wasCached, inputSource, inputPath, width, height, errorDetail, timeoutWarning } = nodeData;
  const removeNode = useProjectStore((s) => s.removeNode);
  const resizeNode = useProjectStore((s) => s.resizeNode);
  const setEditingAgentId = useProjectStore((s) => s.setEditingAgentId);
  const setSelectedNode = useProjectStore((s) => s.setSelectedNode);
  const setRightPanel = useProjectStore((s) => s.setRightPanel);
  const openRolePicker = useProjectStore((s) => s.openRolePicker);
  const t = useT();
  const { currentW, currentH, onMouseDown } = useResize(id, width ?? 280, height ?? 180, resizeNode);

  const config = TYPE_CONFIG[nodeType] ?? TYPE_CONFIG.task;
  const typeLabel = t.node[nodeType];

  // Error severity styling
  const errorSeverity = errorDetail?.severity;
  const isCritical = errorSeverity === "critical";
  const isWarning = errorSeverity === "warning";

  const isCached = status === "completed" && wasCached;

  const statusDotColor =
    status === "pending" ? "bg-boss-text-muted"
    : status === "running" ? "bg-boss-warning"
    : isCached ? "bg-cyan-400"
    : status === "completed" ? "bg-boss-success"
    : isCritical ? "bg-red-600"
    : isWarning ? "bg-yellow-500"
    : "bg-boss-error";

  const statusTextColor =
    isCached ? "text-cyan-400"
    : status === "completed" ? "text-boss-success"
    : status === "running" ? "text-boss-warning"
    : status === "error"
      ? isCritical ? "text-red-400"
      : isWarning ? "text-yellow-400"
      : "text-boss-error"
    : "text-boss-text-muted";

  const statusLabel = isCached ? t.node.cached
    : status === "running" ? t.node.running
    : t.node[status];

  const errorBorderClass =
    status === "error"
      ? isCritical ? "!border-red-600/60 shadow-[0_0_12px_rgba(220,38,38,0.15)]"
      : isWarning ? "!border-yellow-500/40"
      : "!border-boss-error/40"
    : "";

  const errorCodeLabel = errorDetail?.errorCode
    ? errorDetail.errorCode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

  return (
    <div
      className={`node-card group ${selected ? "selected" : ""} ${errorBorderClass}`}
      style={{ width: currentW, height: currentH, minWidth: 260, minHeight: 120 }}
    >
      {nodeType !== "input" && (
        <Handle type="target" position={Position.Top} className={`!w-3 !h-3 !border-2 !border-boss-surface ${config.handle} transition-colors`} />
      )}

      <button
        onClick={(e) => { e.stopPropagation(); removeNode(id); }}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-boss-surface border border-boss-border text-boss-text-muted hover:text-boss-error hover:border-boss-error/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center z-10"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="p-3.5">
        {/* Type badge + status */}
        <div className="flex items-center justify-between mb-2.5">
          <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${config.accent}`}>
            {config.icon}
            {typeLabel}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${statusTextColor}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor} ${status === "running" ? "animate-pulse" : ""} ${isCritical ? "animate-pulse" : ""}`} />
            {isCached ? (
              <span className="inline-flex items-center gap-1">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {statusLabel}
              </span>
            ) : (
              statusLabel
            )}
          </span>
        </div>

        {/* Error detail — shows error code and suggestion on hover */}
        {status === "error" && errorDetail && (
          <div className="mb-2 group/err relative">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono
              ${isCritical ? "bg-red-600/15 text-red-400 border border-red-600/30"
              : isWarning ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
              : "bg-boss-error/10 text-boss-error border border-boss-error/20"}`}>
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="truncate">{errorCodeLabel}</span>
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full left-0 mb-1.5 w-64 p-2.5 rounded-lg bg-boss-surface border border-boss-border shadow-xl opacity-0 pointer-events-none group-hover/err:opacity-100 group-hover/err:pointer-events-auto transition-opacity z-50">
              <p className="text-[10px] font-semibold text-boss-text mb-1">{errorDetail.message}</p>
              <p className="text-[10px] text-boss-text-muted leading-relaxed">{errorDetail.suggestion}</p>
            </div>
          </div>
        )}

        {/* Timeout warning — soft timeout, still waiting */}
        {status === "running" && timeoutWarning && (
          <div className="mb-2 flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20">
            <svg className="w-3 h-3 text-yellow-400 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            <span className="text-[10px] text-yellow-400 truncate">{timeoutWarning}</span>
          </div>
        )}

        {/* Input source indicator */}
        {nodeType === "input" && inputSource && inputSource !== "text" && (
          <div className="mb-2 flex items-center gap-1.5 px-2 py-1 rounded bg-boss-bg border border-boss-border">
            {inputSource === "file" ? (
              <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            ) : (
              <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
            )}
            <span className="text-[10px] text-boss-text-muted truncate">{inputPath || (inputSource === "file" ? t.nodeProps.inputSourceFile : t.nodeProps.inputSourceUrl)}</span>
          </div>
        )}

        {/* Instruction text */}
        <p className="text-sm text-boss-text leading-snug mb-2.5 line-clamp-3 font-medium">
          {label || (
            <span className="text-boss-text-muted/40 italic">
              {(t.node as Record<string, string>)[PLACEHOLDER_MAP[nodeType]] ?? t.node.describeTask}
            </span>
          )}
        </p>

        {/* Agent avatars */}
        <div className="flex items-center justify-between pt-2 border-t border-boss-border">
          {agentNames.length > 0 ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              {agentNames.map((name, i) => {
                const avatar = agentAvatars?.[i];
                const aId = agentIds?.[i];
                const avatarEl = avatar?.startsWith("data:") ? (
                  <img src={avatar} className="w-12 h-12 rounded-full object-cover border-2 border-boss-border shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-boss-bg border-2 border-boss-border flex items-center justify-center text-xl shrink-0">
                    {avatar || "👤"}
                  </div>
                );
                return (
                  <AgentTooltip key={name + i} agentId={aId || ""}>
                    <button onClick={(e) => { e.stopPropagation(); if (aId) setEditingAgentId(aId); }}>
                      {avatarEl}
                    </button>
                  </AgentTooltip>
                );
              })}
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedNode(id); setRightPanel("properties"); openRolePicker(id); }}
              className="flex items-center gap-1.5 hover:bg-boss-accent/10 rounded-md px-1.5 py-0.5 -ml-1.5 transition-colors group/assign cursor-pointer"
              title="Click to assign roles"
            >
              <div className="w-6 h-6 rounded-full bg-boss-border/30 group-hover/assign:bg-boss-accent/20 flex items-center justify-center shrink-0 transition-colors">
                <svg className="w-3 h-3 text-boss-text-muted/40 group-hover/assign:text-boss-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <span className="text-[11px] text-boss-text-muted/40 group-hover/assign:text-boss-accent italic transition-colors">{t.node.unassigned}</span>
              <svg className="w-3 h-3 text-boss-text-muted/30 group-hover/assign:text-boss-accent opacity-0 group-hover/assign:opacity-100 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}

          {collaborationMode && agentIds.length > 1 && (
            <span className="inline-flex items-center gap-1 text-[9px] font-medium text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5 shrink-0" title={t.nodeProps.modeDesc[collaborationMode]}>
              {MODE_ICON[collaborationMode] || "·"}
              <span className="hidden sm:inline">{t.nodeProps.modeLabel[collaborationMode]}</span>
            </span>
          )}
          <span className="text-[9px] text-boss-text-muted/30 opacity-0 group-hover:opacity-100 transition-opacity">
            {t.node.clickToEdit}
          </span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className={`!w-3 !h-3 !border-2 !border-boss-surface ${config.handle} transition-colors`} />

      {/* Resize grip */}
      <div
        onMouseDown={onMouseDown}
        className="nodrag absolute bottom-0.5 right-0.5 w-5 h-5 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
      >
        <svg className="w-3 h-3 text-boss-text-muted/30 rotate-90" fill="currentColor" viewBox="0 0 24 24">
          <path d="M22 22H2L12 2l10 20z" />
        </svg>
      </div>

    </div>
  );
}

export default memo(BossNodeComponent);
