import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { exportWorkflow } from "@/services/workflowIO";
import { useT } from "@/i18n";
import type { NodeType } from "@/types/project";

export interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  nodeId?: string;
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

// ── Helpers ──────────────────────────────────────────────────────────

function MenuItem({
  onClick, children, danger, shortcut, dimmed,
}: {
  onClick: () => void; children: React.ReactNode; danger?: boolean; shortcut?: string; dimmed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${
        danger ? "text-boss-error hover:bg-boss-error/10" :
        dimmed ? "text-boss-text-muted hover:bg-boss-surface-hover" :
        "text-boss-text hover:bg-boss-surface-hover"
      }`}
    >
      <span className="flex items-center gap-2">{children}</span>
      {shortcut && <span className="text-[10px] text-boss-text-muted/60 ml-4 shrink-0">{shortcut}</span>}
    </button>
  );
}

function Separator() {
  return <div className="h-px bg-boss-border my-1 mx-2" />;
}

// ── Submenu ──────────────────────────────────────────────────────────

function SubMenuItem({
  label, children, onClose,
}: {
  label: string; children: React.ReactNode; onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const onEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const onLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 200);
  };

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-boss-text hover:bg-boss-surface-hover transition-colors text-left"
        onClick={(e) => { e.stopPropagation(); }}
      >
        <span>{label}</span>
        <svg className="w-3 h-3 text-boss-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute left-full top-0 ml-1 w-40 bg-boss-surface border border-boss-border rounded-lg shadow-2xl py-1 z-[70] overflow-hidden"
          onMouseEnter={onEnter} onMouseLeave={onLeave}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function ContextMenu({ x, y, onClose, nodeId, onAddNode }: ContextMenuProps) {
  const removeNode = useProjectStore((s) => s.removeNode);
  const duplicateNode = useProjectStore((s) => s.duplicateNode);
  const resizeNode = useProjectStore((s) => s.resizeNode);
  const runWorkflow = useProjectStore((s) => s.runWorkflow);
  const runFrom = useProjectStore((s) => s.runWorkflowFromNode);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const autoLayout = useProjectStore((s) => s.autoLayout);
  const copySelected = useProjectStore((s) => s.copySelectedNodes);
  const cutSelected = useProjectStore((s) => s.cutSelectedNodes);
  const pasteNodes = useProjectStore((s) => s.pasteNodes);
  const selectAllNodes = useProjectStore((s) => s.selectAllNodes);
  const exportSelected = useProjectStore((s) => s.exportSelectedAsWorkflow);
  const clipboard = useProjectStore((s) => s.clipboard);
  const isRunning = useProjectStore((s) => s.isRunning);
  const canvasNodes = useProjectStore((s) => s.canvasNodes);

  const t = useT();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Adjust position to stay within viewport
  const adjX = Math.min(x, window.innerWidth - 200);
  const adjY = Math.min(y, window.innerHeight - 400);

  // ── Node context menu ────────────────────────────────────────────
  if (nodeId) {
    const node = canvasNodes.find((n) => n.id === nodeId);
    const isOutputNode = (node?.data as { nodeType?: string })?.nodeType === "output";
    const selectedCount = canvasNodes.filter((n) => (n as any).selected).length;
    const hasMultiSelection = selectedCount > 1;
    const hasClipboard = clipboard && clipboard.nodes.length > 0;

    return (
      <div
        ref={menuRef}
        className="fixed z-[60] w-44 bg-boss-surface border border-boss-border rounded-lg shadow-2xl py-1 overflow-visible"
        style={{ left: adjX, top: adjY }}
      >
        {/* Copy / Cut — operates on all selected nodes when multi-selected */}
        <MenuItem onClick={() => { copySelected(); onClose(); }} shortcut="⌘C">
          <svg className="w-3.5 h-3.5 text-boss-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
          </svg>
          {hasMultiSelection ? t.canvas.copySelected : t.canvas.copy}
        </MenuItem>
        <MenuItem onClick={() => { cutSelected(); onClose(); }} shortcut="⌘X">
          <svg className="w-3.5 h-3.5 text-boss-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
          {hasMultiSelection ? t.canvas.cutSelected : t.canvas.cut}
        </MenuItem>
        <MenuItem onClick={() => { pasteNodes(); onClose(); }} shortcut="⌘V" dimmed={!hasClipboard}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
          </svg>
          {t.canvas.paste}
        </MenuItem>
        {/* Duplicate all selected, or just this one */}
        <MenuItem onClick={() => {
          if (hasMultiSelection) {
            const selectedIds = canvasNodes.filter((n) => (n as any).selected).map((n) => n.id);
            for (const id of selectedIds) duplicateNode(id);
          } else {
            duplicateNode(nodeId);
          }
          onClose();
        }} shortcut="⌘D">
          <svg className="w-3.5 h-3.5 text-boss-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          {hasMultiSelection ? t.canvas.duplicateSelected : t.canvas.duplicate}
        </MenuItem>

        <Separator />

        {/* Resize — only for single node */}
        {!hasMultiSelection && (
          <MenuItem onClick={() => { resizeNode(nodeId, 400, 300); onClose(); }}>
            <svg className="w-3.5 h-3.5 text-boss-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 8.25M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15.75M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 8.25m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15.75" />
            </svg>
            {t.canvas.resize}
          </MenuItem>
        )}

        {/* Run from here (skip for output) — only for single node */}
        {!hasMultiSelection && !isOutputNode && (
          <MenuItem onClick={() => { runFrom(nodeId); onClose(); }} dimmed={isRunning}>
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
            {isRunning ? t.canvas.running : t.canvas.runFromHere}
          </MenuItem>
        )}

        {!hasMultiSelection && !isOutputNode && <Separator />}
        {hasMultiSelection && <Separator />}

        {/* Delete — removes all selected nodes when multi-selected */}
        <MenuItem onClick={() => {
          if (hasMultiSelection) {
            const selectedIds = canvasNodes.filter((n) => (n as any).selected).map((n) => n.id);
            for (const id of selectedIds) removeNode(id);
          } else {
            removeNode(nodeId);
          }
          onClose();
        }} danger shortcut="⌫">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          {hasMultiSelection ? t.canvas.deleteSelected : t.canvas.delete}
        </MenuItem>
      </div>
    );
  }

  // ── Canvas context menu ──────────────────────────────────────────
  const hasSelection = canvasNodes.some((n) => (n as any).selected);
  const hasClipboard = clipboard && clipboard.nodes.length > 0;

  return (
    <div
      ref={menuRef}
      className="fixed z-[60] w-44 bg-boss-surface border border-boss-border rounded-lg shadow-2xl py-1 overflow-visible"
      style={{ left: adjX, top: adjY }}
    >
      {/* Add Node — submenu */}
      <SubMenuItem label={t.canvas.addNode + " ▸"} onClose={onClose}>
        {NODE_TYPES.map((nt) => (
          <MenuItem key={nt.type} onClick={() => { onAddNode?.(nt.type); onClose(); }}>
            <span className={`w-2 h-2 rounded-full ${nt.color.replace("text-", "bg-")}`} />
            {(t.canvas as Record<string, string>)[nt.labelKey]}
          </MenuItem>
        ))}
      </SubMenuItem>

      <Separator />

      {/* Paste */}
      <MenuItem onClick={() => { pasteNodes(); onClose(); }} shortcut="⌘V" dimmed={!hasClipboard}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
        </svg>
        {t.canvas.paste}
      </MenuItem>

      {/* Copy / Cut / Select All */}
      <MenuItem onClick={() => { copySelected(); onClose(); }} shortcut="⌘C" dimmed={!hasSelection}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
        </svg>
        {t.canvas.copy}
      </MenuItem>
      <MenuItem onClick={() => { cutSelected(); onClose(); }} shortcut="⌘X" dimmed={!hasSelection}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
        </svg>
        {t.canvas.cut}
      </MenuItem>
      <MenuItem onClick={() => { selectAllNodes(); onClose(); }} shortcut="⌘A">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        {t.canvas.selectAll}
      </MenuItem>

      {/* Export selected */}
      <MenuItem onClick={() => {
        const proj = exportSelected();
        if (proj) exportWorkflow(proj);
        onClose();
      }} dimmed={!hasSelection}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
        {t.canvas.exportSelected}
      </MenuItem>

      <Separator />

      {/* Run */}
      <MenuItem onClick={() => { runWorkflow(); onClose(); }} dimmed={isRunning}>
        <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
        {isRunning ? t.canvas.running : t.canvas.runAll}
      </MenuItem>

      <Separator />

      {/* Layout / View */}
      <MenuItem onClick={() => { autoLayout(); onClose(); }}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
        {t.toolbar.autoLayout}
      </MenuItem>

      <Separator />

      {/* Undo / Redo */}
      <MenuItem onClick={() => { undo(); onClose(); }} shortcut="⌘Z">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
        {t.canvas.undo}
      </MenuItem>
      <MenuItem onClick={() => { redo(); onClose(); }} shortcut="⌘⇧Z">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
        </svg>
        {t.canvas.redo}
      </MenuItem>
    </div>
  );
}
