import { useEffect, useRef } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import type { NodeType } from "@/types/project";

export interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  /** If set, this is a node context menu */
  nodeId?: string;
  /** If no nodeId, these are the add-node items */
  onAddNode?: (type: NodeType) => void;
}

const NODE_TYPES: { type: NodeType; labelKey: string; color: string }[] = [
  { type: "input", labelKey: "contextNodeInput", color: "text-blue-400" },
  { type: "task", labelKey: "contextNodeTask", color: "text-amber-400" },
  { type: "logic", labelKey: "contextNodeSummary", color: "text-purple-400" },
  { type: "decision", labelKey: "contextNodeDecision", color: "text-rose-400" },
  { type: "switch", labelKey: "contextNodeSwitch", color: "text-violet-400" },
  { type: "loop", labelKey: "contextNodeLoop", color: "text-cyan-400" },
  { type: "output", labelKey: "contextNodeOutput", color: "text-emerald-400" },
];

export default function ContextMenu({ x, y, onClose, nodeId, onAddNode }: ContextMenuProps) {
  const removeNode = useProjectStore((s) => s.removeNode);
  const duplicateNode = useProjectStore((s) => s.duplicateNode);
  const resizeNode = useProjectStore((s) => s.resizeNode);
  const t = useT();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay adding listener so the right-click event itself doesn't close it
    setTimeout(() => document.addEventListener("click", handleClickOutside), 0);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [onClose]);

  // Adjust position to stay within viewport
  const adjX = Math.min(x, window.innerWidth - 180);
  const adjY = Math.min(y, window.innerHeight - 220);

  // Node context menu
  if (nodeId) {
    return (
      <div
        ref={menuRef}
        className="fixed z-[60] w-40 bg-boss-surface border border-boss-border rounded-lg shadow-2xl py-1 overflow-hidden"
        style={{ left: adjX, top: adjY }}
      >
        <button
          onClick={() => { duplicateNode(nodeId); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-boss-text hover:bg-boss-surface-hover transition-colors text-left"
        >
          <svg className="w-3.5 h-3.5 text-boss-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
          </svg>
          {t.canvas.copy}
        </button>

        <button
          onClick={() => { resizeNode(nodeId, 400, 300); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-boss-text hover:bg-boss-surface-hover transition-colors text-left"
        >
          <svg className="w-3.5 h-3.5 text-boss-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 8.25M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15.75M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 8.25m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15.75" />
          </svg>
          {t.canvas.resize}
        </button>

        <div className="h-px bg-boss-border my-1 mx-2" />

        <button
          onClick={() => { removeNode(nodeId); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-boss-error hover:bg-boss-error/10 transition-colors text-left"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          {t.canvas.delete}
        </button>
      </div>
    );
  }

  // Canvas context menu — add nodes
  return (
    <div
      ref={menuRef}
      className="fixed z-[60] w-40 bg-boss-surface border border-boss-border rounded-lg shadow-2xl py-1 overflow-hidden"
      style={{ left: adjX, top: adjY }}
    >
      <p className="px-3 py-1.5 text-[9px] text-boss-text-muted uppercase tracking-wider font-semibold">{t.canvas.addNode}</p>
      {NODE_TYPES.map((nt) => (
        <button
          key={nt.type}
          onClick={() => { onAddNode?.(nt.type); onClose(); }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${nt.color} hover:bg-boss-surface-hover transition-colors text-left`}
        >
          {(t.canvas as Record<string, string>)[nt.labelKey]}
        </button>
      ))}
    </div>
  );
}
