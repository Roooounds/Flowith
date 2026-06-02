import { type DragEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import type { NodeType } from "@/types/project";

const DOCK_ITEMS = [
  {
    type: "input" as NodeType,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
      </svg>
    ),
    color: "text-blue-400 border-blue-500/20 hover:border-blue-400/50 hover:bg-blue-500/5",
  },
  {
    type: "task" as NodeType,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
    color: "text-amber-400 border-amber-500/20 hover:border-amber-400/50 hover:bg-amber-500/5",
  },
  {
    type: "logic" as NodeType,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18L15 10.5v6l-6 3v-9L3 4.5z" />
      </svg>
    ),
    color: "text-cyan-400 border-cyan-500/20 hover:border-cyan-400/50 hover:bg-cyan-500/5",
  },
  {
    type: "decision" as NodeType,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: "text-orange-400 border-orange-500/20 hover:border-orange-400/50 hover:bg-orange-500/5",
  },
  {
    type: "switch" as NodeType,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    color: "text-violet-400 border-violet-500/20 hover:border-violet-400/50 hover:bg-violet-500/5",
  },
  {
    type: "loop" as NodeType,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
      </svg>
    ),
    color: "text-pink-400 border-pink-500/20 hover:border-pink-400/50 hover:bg-pink-500/5",
  },
  {
    type: "output" as NodeType,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: "text-emerald-400 border-emerald-500/20 hover:border-emerald-400/50 hover:bg-emerald-500/5",
  },
];

export default function BottomDock() {
  const addNode = useProjectStore((s) => s.addNode);
  const t = useT();

  const onDragStart = (event: DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData("application/boss-node-type", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const { screenToFlowPosition } = useReactFlow();
  const onQuickAdd = (nodeType: NodeType) => {
    const el = document.querySelector(".react-flow");
    const rect = el?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : 500;
    const cy = rect ? rect.top + rect.height / 2 : 300;
    addNode(nodeType, screenToFlowPosition({ x: cx, y: cy }));
  };

  const labels: Record<string, string> = {
    input: t.toolbar.inputLabel,
    task: t.toolbar.taskLabel,
    logic: t.toolbar.logicLabel,
    decision: t.toolbar.decisionLabel,
    switch: t.toolbar.switchLabel,
    loop: t.toolbar.loopLabel,
    output: t.toolbar.outputLabel,
  };

  return (
    <div className="h-14 bg-boss-surface border-t border-boss-border flex items-center justify-center gap-1 px-4 select-none shrink-0">
      {DOCK_ITEMS.map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => onDragStart(e, item.type)}
          onClick={() => onQuickAdd(item.type)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all ${item.color}`}
        >
          {item.icon}
          <span className="text-[11px] font-medium">{labels[item.type]}</span>
        </div>
      ))}

    </div>
  );
}
