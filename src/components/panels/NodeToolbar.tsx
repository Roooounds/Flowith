import { type DragEvent, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import type { NodeType } from "@/types/project";

function AutoLayoutButton() {
  const autoLayout = useProjectStore((s) => s.autoLayout);
  const t = useT();
  const { fitView } = useReactFlow();

  const handleLayout = useCallback(() => {
    autoLayout();
    setTimeout(() => fitView({ duration: 400, padding: 0.2 }), 50);
  }, [autoLayout, fitView]);

  return (
    <button
      onClick={handleLayout}
      className="w-full py-2 rounded-lg border border-boss-border hover:border-boss-accent/50 hover:bg-boss-surface-hover text-xs text-boss-text-muted hover:text-boss-text transition-colors flex items-center justify-center gap-1.5"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
      {t.toolbar.autoLayout}
    </button>
  );
}

export default function NodeToolbar() {
  const addNode = useProjectStore((s) => s.addNode);
  const t = useT();

  const items = [
    {
      type: "input" as NodeType,
      label: t.toolbar.inputLabel,
      description: t.toolbar.inputDesc,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
        </svg>
      ),
    },
    {
      type: "task" as NodeType,
      label: t.toolbar.taskLabel,
      description: t.toolbar.taskDesc,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      ),
    },
    {
      type: "logic" as NodeType,
      label: t.toolbar.logicLabel,
      description: t.toolbar.logicDesc,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      ),
    },
    {
      type: "decision" as NodeType,
      label: t.toolbar.decisionLabel,
      description: t.toolbar.decisionDesc,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  const onDragStart = (event: DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData("application/boss-node-type", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const onQuickAdd = (nodeType: NodeType) => {
    addNode(nodeType, {
      x: 300 + Math.random() * 200,
      y: 200 + Math.random() * 150,
    });
  };

  return (
    <aside className="w-56 shrink-0 bg-boss-surface border-r border-boss-border flex flex-col select-none overflow-y-auto">
      <div className="px-3 py-3 border-b border-boss-border">
        <p className="text-[11px] font-medium uppercase tracking-wider text-boss-text-muted">
          {t.toolbar.nodeTypes}
        </p>
        <p className="text-[10px] text-boss-text-muted/50 mt-0.5">
          {t.toolbar.dragHint}
        </p>
      </div>

      <div className="flex-1 p-2 space-y-1">
        {items.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            onClick={() => onQuickAdd(item.type)}
            className="flex items-start gap-3 p-3 rounded-lg border border-boss-border hover:border-boss-border-active hover:bg-boss-surface-hover cursor-grab active:cursor-grabbing transition-all group"
          >
            <div className="text-boss-accent shrink-0 mt-0.5 group-hover:text-boss-accent-hover transition-colors">
              {item.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-boss-text">{item.label}</p>
              <p className="text-[10px] text-boss-text-muted leading-snug mt-0.5">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Auto layout button */}
      <div className="p-2 border-t border-boss-border">
        <AutoLayoutButton />
      </div>

      {/* Tip */}
      <div className="px-3 pb-3">
        <div className="flex items-start gap-2 text-[10px] text-boss-text-muted/50 leading-relaxed">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <span>{t.toolbar.tipText}</span>
        </div>
      </div>
    </aside>
  );
}
