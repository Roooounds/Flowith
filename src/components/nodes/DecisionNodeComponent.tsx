import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import { useResize } from "@/hooks/useResize";
import type { BossNodeData } from "@/types/canvas";

function DecisionNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as BossNodeData;
  const { label, agentNames, agentAvatars, status, outputCache, width, height } = nodeData;
  const removeNode = useProjectStore((s) => s.removeNode);
  const resizeNode = useProjectStore((s) => s.resizeNode);
  const setSelectedNode = useProjectStore((s) => s.setSelectedNode);
  const setRightPanel = useProjectStore((s) => s.setRightPanel);
  const openRolePicker = useProjectStore((s) => s.openRolePicker);
  const t = useT();
  const { currentW, currentH, onMouseDown } = useResize(id, width ?? 200, height ?? 200, resizeNode);

  const statusDotColor =
    status === "pending" ? "bg-boss-text-muted"
    : status === "running" ? "bg-boss-warning"
    : status === "completed" ? "bg-boss-success"
    : "bg-boss-error";

  const statusTextColor =
    status === "completed" ? "text-boss-success"
    : status === "running" ? "text-boss-warning"
    : status === "error" ? "text-boss-error"
    : "text-boss-text-muted";

  const statusLabel = status === "running" ? t.node.running : t.node[status];

  return (
    <div className="relative group" style={{ width: currentW, height: currentH, minWidth: 180, minHeight: 180 }}>
      {/* Input handle (top) — offset to sit on the diamond tip */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-rose-400 !w-3.5 !h-3.5 !border-2 !border-boss-surface"
        style={{ top: 8 }}
      />

      {/* Diamond shape */}
      <div
        className={`absolute inset-[14px] bg-boss-surface border-2 rotate-45 transition-all ${
          selected
            ? "border-rose-400 shadow-[0_0_0_3px_rgba(251,113,133,0.3)]"
            : status === "error"
              ? "border-boss-error/40"
              : "border-rose-500/30 hover:border-rose-400/60"
        }`}
        style={{ borderRadius: 16 }}
      />

      {/* Content (counter-rotated) */}
      <div className="absolute inset-[14px] flex flex-col items-center justify-center p-3">
        {/* Type icon */}
        <div className="flex items-center gap-1 mb-1.5">
          <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[9px] uppercase tracking-wider font-semibold text-rose-400 border border-rose-500/20 rounded px-1 py-0.5 bg-rose-500/10">
            {t.node.decision}
          </span>
        </div>

        {/* Status dot */}
        <span className={`inline-flex items-center gap-1 text-[9px] font-medium ${statusTextColor} mb-1`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor} ${status === "running" ? "animate-pulse" : ""}`} />
          {statusLabel}
        </span>

        {/* Instruction */}
        <p className="text-[11px] text-boss-text leading-snug text-center line-clamp-2 font-medium max-w-[130px]">
          {label || (
            <span className="text-boss-text-muted/40 italic">{t.node.defineDecision}</span>
          )}
        </p>

        {/* Result (when completed) */}
        {status === "completed" && outputCache && (
          <p className={`text-[10px] font-bold mt-1 ${outputCache === "yes" ? "text-emerald-400" : "text-rose-400"}`}>
            → {outputCache === "yes" ? t.node.yes : t.node.no}
          </p>
        )}

        {/* Agent avatars */}
        {agentNames.length > 0 ? (
          <div className="flex items-center gap-1 mt-1.5 justify-center">
            {agentNames.map((name, i) => {
              const avatar = agentAvatars?.[i];
              return (
                <div key={name + i} className="relative group/avatar">
                  {avatar?.startsWith("data:") ? (
                    <img src={avatar} className="w-10 h-10 rounded-full object-cover border-2 border-boss-border shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-boss-bg border-2 border-boss-border flex items-center justify-center text-base shrink-0">
                      {avatar || "👤"}
                    </div>
                  )}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 rounded bg-boss-bg border border-boss-border text-[9px] text-boss-text whitespace-nowrap opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none shadow-lg z-20">
                    {name}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedNode(id); setRightPanel("properties"); openRolePicker(id); }}
            className="flex items-center gap-1 mt-1.5 hover:bg-rose-500/10 rounded-md px-1.5 py-0.5 transition-colors group/assign cursor-pointer"
            title="Click to assign roles"
          >
            <svg className="w-3 h-3 text-boss-text-muted/30 group-hover/assign:text-rose-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-[9px] text-boss-text-muted/40 group-hover/assign:text-rose-400 transition-colors">{t.node.unassigned}</span>
          </button>
        )}
      </div>

      {/* Output handles — "No" (left edge), "Yes" (right edge) */}
      <Handle
        type="source"
        position={Position.Left}
        id="no"
        className="!bg-rose-400 !w-3 !h-3 !border-2 !border-boss-surface"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        className="!bg-emerald-400 !w-3 !h-3 !border-2 !border-boss-surface"
      />

      {/* Labels for handles */}
      <span className="absolute top-1/2 left-1 -translate-y-1/2 text-[9px] font-semibold text-rose-400 pointer-events-none">
        {t.node.no}
      </span>
      <span className="absolute top-1/2 right-1 -translate-y-1/2 text-[9px] font-semibold text-emerald-400 pointer-events-none">
        {t.node.yes}
      </span>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); removeNode(id); }}
        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-boss-surface border border-boss-border text-boss-text-muted hover:text-boss-error hover:border-boss-error/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center z-10"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Resize grip */}
      <div
        onMouseDown={onMouseDown}
        className="nodrag absolute bottom-0.5 right-0.5 w-5 h-5 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
      >
        <svg className="w-3 h-3 text-boss-text-muted/30 rotate-90" fill="currentColor" viewBox="0 0 24 24">
          <path d="M22 22H2L12 2l10 20z" />
        </svg>
      </div>

    </div>
  );
}

export default memo(DecisionNodeComponent);
