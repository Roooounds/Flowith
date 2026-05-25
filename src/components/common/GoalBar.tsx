import { useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import KnowledgeBasePanel from "../panels/KnowledgeBasePanel";

export default function GoalBar() {
  const project = useProjectStore((s) => s.project);
  const updateGoal = useProjectStore((s) => s.updateProjectGoal);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [showKb, setShowKb] = useState(false);
  const t = useT();

  if (!project) return null;

  const goal = project.goal ?? "";

  const startEdit = () => {
    setDraft(goal);
    setEditing(true);
  };

  const saveEdit = () => {
    updateGoal(draft.trim());
    setEditing(false);
  };

  return (
    <>
      <div className="h-10 bg-boss-surface border-b border-boss-border flex items-center gap-2 px-4 select-none shrink-0">
        {/* Icon */}
        <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>

        {/* Label */}
        <span className="text-[10px] uppercase tracking-wider font-semibold text-yellow-400 shrink-0">
          {t.node.goal}
        </span>

        {editing ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
              placeholder={t.node.defineGoal}
              className="flex-1 px-2 py-0.5 bg-boss-bg border border-boss-border rounded text-xs text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors"
              autoFocus
            />
            <button onClick={saveEdit} className="px-2 py-0.5 text-[10px] bg-boss-accent text-white rounded hover:bg-boss-accent-hover transition-colors">{t.goalBar.save}</button>
            <button onClick={() => setEditing(false)} className="px-2 py-0.5 text-[10px] text-boss-text-muted hover:text-boss-text transition-colors">{t.goalBar.cancel}</button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex-1 text-left text-xs text-boss-text-muted hover:text-boss-text transition-colors truncate"
          >
            {goal || (
              <span className="italic text-boss-text-muted/40">{t.node.defineGoal}</span>
            )}
          </button>
        )}

        {/* KB button */}
        <button
          onClick={() => setShowKb(!showKb)}
          className={`px-2 py-0.5 text-[10px] rounded transition-colors shrink-0 ${
            showKb
              ? "text-yellow-400 bg-yellow-400/10"
              : "text-boss-text-muted/50 hover:text-yellow-400 hover:bg-yellow-400/5"
          }`}
          title={t.kb?.title || "Knowledge Base"}
        >
          📚 {t.kb?.title || "Knowledge Base"}
        </button>
      </div>

      {/* KB modal */}
      {showKb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowKb(false)}>
          <div
            className="w-[560px] max-h-[80vh] rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <KnowledgeBasePanel insideModal onClose={() => setShowKb(false)} />
          </div>
        </div>
      )}
    </>
  );
}
