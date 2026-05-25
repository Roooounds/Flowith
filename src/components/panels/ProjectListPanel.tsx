import { useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import { openProjectFolder } from "@/services/fileStorage";
import NewProjectModal from "@/components/common/NewProjectModal";
import AgentManagerPanel from "@/components/panels/AgentManagerPanel";

export default function ProjectListPanel() {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const switchProject = useProjectStore((s) => s.switchProject);
  const removeProject = useProjectStore((s) => s.removeProject);
  const t = useT();
  const [showNewModal, setShowNewModal] = useState(false);
  const [showRoles, setShowRoles] = useState(false);

  const nodeCount = (pid: string) => {
    const p = projects.find((pr) => pr.projectId === pid);
    return p?.workflow.nodes.length ?? 0;
  };

  return (
    <aside className="w-52 shrink-0 bg-boss-surface border-r border-boss-border flex flex-col select-none overflow-y-auto">
      <div className="px-3 py-3 border-b border-boss-border">
        <p className="text-[11px] font-medium uppercase tracking-wider text-boss-text-muted">
          {showRoles ? t.projectList.roles : t.projectList.projects}
        </p>
      </div>

      {showRoles && <AgentManagerPanel embedded onClose={() => setShowRoles(false)} />}

      {!showRoles && (
        <>
          <div className="p-2 shrink-0">
            <button onClick={() => setShowNewModal(true)} className="w-full py-1.5 rounded-lg border border-dashed border-boss-border hover:border-boss-accent text-[11px] text-boss-text-muted hover:text-boss-accent transition-colors">
              {t.projectList.newProject}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {projects.length === 0 && <p className="text-xs text-boss-text-muted/50 text-center py-4 px-2">{t.projectList.noProjects}</p>}
            {projects.map((proj) => (
              <div key={proj.projectId} onClick={() => switchProject(proj.projectId)}
                className={`p-2.5 rounded-lg border cursor-pointer transition-colors group ${proj.projectId === activeProjectId ? "border-boss-accent/50 bg-boss-accent/5" : "border-boss-border hover:border-boss-border-active hover:bg-boss-surface-hover"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-boss-text truncate flex-1 mr-1">{proj.name}</p>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {proj.folderPath && (
                      <button onClick={(e) => { e.stopPropagation(); openProjectFolder(proj.folderPath); }}
                        className="p-0.5 rounded hover:bg-boss-accent/15 text-boss-text-muted hover:text-boss-accent transition-all" title={`Open: ${proj.folderPath}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" /></svg>
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); removeProject(proj.projectId); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-boss-error/20 text-boss-text-muted hover:text-boss-error transition-all shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-boss-text-muted/50">{nodeCount(proj.projectId)} {t.projectList.nodeCount}</span>
                  <span className="text-[9px] text-boss-text-muted/30">{proj.agents.length} {t.projectList.agentCount}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="p-2 border-t border-boss-border shrink-0">
        <button onClick={() => setShowRoles(!showRoles)}
          className="w-full py-1.5 rounded-lg border border-boss-border hover:border-boss-accent/50 text-[11px] text-boss-text-muted hover:text-boss-text transition-colors flex items-center justify-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          {showRoles ? t.projectList.backToProjects : t.projectList.roles}
        </button>
      </div>

      {showNewModal && <NewProjectModal onClose={() => setShowNewModal(false)} />}
    </aside>
  );
}
