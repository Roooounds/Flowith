import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import { useResize } from "@/hooks/useResize";
import type { BossNodeData } from "@/types/canvas";

const BRANCH_COLORS = [
  "bg-blue-400",
  "bg-amber-400",
  "bg-emerald-400",
  "bg-purple-400",
  "bg-rose-400",
  "bg-cyan-400",
];

function SwitchNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as BossNodeData;
  const { label, agentNames, agentAvatars, agentIds, status, switchBranches, width, height } = nodeData;
  const removeNode = useProjectStore((s) => s.removeNode);
  const resizeNode = useProjectStore((s) => s.resizeNode);
  const setSelectedNode = useProjectStore((s) => s.setSelectedNode);
  const setRightPanel = useProjectStore((s) => s.setRightPanel);
  const openRolePicker = useProjectStore((s) => s.openRolePicker);
  const t = useT();
  const { currentW, currentH, onMouseDown } = useResize(id, width ?? 280, height ?? 220, resizeNode);

  const branches = switchBranches ?? ["branch_1", "branch_2"];
  const branchCount = branches.length;

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
    <div className="relative group" style={{ width: currentW, height: currentH, minWidth: 220, minHeight: 160 }}>
      {/* Input handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-violet-400 !w-3 !h-3 !border-2 !border-boss-surface"
        style={{ top: 8 }}
      />

      {/* Body: rounded hexagon feel — wider than tall */}
      <div
        className={`absolute inset-2 border-2 transition-all ${
          selected
            ? "border-violet-400 shadow-[0_0_0_3px_rgba(167,139,250,0.3)]"
            : status === "error"
              ? "border-boss-error/40"
              : "border-violet-500/30 hover:border-violet-400/60"
        }`}
        style={{
          borderRadius: 20,
          background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(139,92,246,0.02))",
          backgroundColor: "var(--boss-surface, #1a1b23)",
        }}
      />

      {/* Content */}
      <div className="absolute inset-2 flex flex-col items-center justify-center p-3">
        {/* Type badge */}
        <div className="flex items-center gap-1 mb-1.5">
          <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <span className="text-[9px] uppercase tracking-wider font-semibold text-violet-400 border border-violet-500/20 rounded px-1 py-0.5 bg-violet-500/10">
            Switch
          </span>
        </div>

        {/* Status dot */}
        <span className={`inline-flex items-center gap-1 text-[9px] font-medium ${statusTextColor} mb-1`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor} ${status === "running" ? "animate-pulse" : ""}`} />
          {statusLabel}
        </span>

        {/* Instruction */}
        <p className="text-[11px] text-boss-text leading-snug text-center line-clamp-2 font-medium max-w-[200px]">
          {label || (
            <span className="text-boss-text-muted/40 italic">Route condition...</span>
          )}
        </p>

        {/* Branch count badge */}
        <span className="text-[9px] text-violet-400/60 mt-1 font-medium">
          {branchCount} {branchCount === 1 ? "branch" : "branches"}
        </span>

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
            className="flex items-center gap-1 mt-1.5 hover:bg-violet-500/10 rounded-md px-1.5 py-0.5 transition-colors group/assign cursor-pointer"
            title="Click to assign roles"
          >
            <svg className="w-3 h-3 text-boss-text-muted/30 group-hover/assign:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-[9px] text-boss-text-muted/40 group-hover/assign:text-violet-400 transition-colors">{t.node.unassigned}</span>
          </button>
        )}
      </div>

      {/* Output handles — one per branch, distributed along bottom edge */}
      {branches.map((branch, i) => {
        // Space handles evenly along the bottom
        const pct = ((i + 1) / (branchCount + 1)) * 100;
        return (
          <Handle
            key={branch}
            type="source"
            position={Position.Bottom}
            id={branch}
            className={`!w-2.5 !h-2.5 !border-2 !border-boss-surface ${BRANCH_COLORS[i % BRANCH_COLORS.length]}`}
            style={{ left: `${pct}%` }}
          />
        );
      })}

      {/* Branch label strip along bottom */}
      <div className="absolute bottom-0.5 left-4 right-4 flex justify-between pointer-events-none">
        {branches.map((branch, i) => {
          const pct = ((i + 1) / (branchCount + 1)) * 100;
          return (
            <span
              key={branch}
              className="text-[8px] font-semibold text-boss-text-muted/50 truncate max-w-[60px] text-center"
              style={{ position: "absolute", left: `${pct}%`, transform: "translateX(-50%)", bottom: 2 }}
            >
              {branch}
            </span>
          );
        })}
      </div>

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

export default memo(SwitchNodeComponent);
