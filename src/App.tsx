import { useState, useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import WorkflowCanvas from "./components/canvas/WorkflowCanvas";
import WelcomeModal from "./components/common/WelcomeModal";
import ProjectListPanel from "./components/panels/ProjectListPanel";
import BottomDock from "./components/panels/BottomDock";
import NodePropertiesPanel from "./components/panels/NodePropertiesPanel";
import SettingsModal from "./components/common/SettingsModal";
import RoleEditorModal from "./components/common/RoleEditorModal";
import { exportWorkflow, importWorkflowNative } from "./services/workflowIO";
import GoalBar from "./components/common/GoalBar";
import { useProjectStore } from "./stores/projectStore";
import { applyAppTheme } from "./services/appConfig";
import { useT } from "./i18n";

function ProgressBar() {
  const isRunning = useProjectStore((s) => s.isRunning);
  const runProgress = useProjectStore((s) => s.runProgress);

  if (!isRunning || runProgress.total === 0) return null;

  const pct = Math.round((runProgress.completed / runProgress.total) * 100);

  return (
    <div className="h-1 bg-boss-border shrink-0">
      <div
        className="h-full bg-boss-accent transition-all duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function RunButton() {
  const isRunning = useProjectStore((s) => s.isRunning);
  const runWorkflow = useProjectStore((s) => s.runWorkflow);
  const project = useProjectStore((s) => s.project);
  const t = useT();

  const nodeCount = project?.workflow.nodes.length ?? 0;

  return (
    <button
      onClick={runWorkflow}
      disabled={isRunning || nodeCount === 0}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
        isRunning
          ? "bg-boss-accent/10 text-boss-accent animate-pulse cursor-wait"
          : "bg-boss-accent hover:bg-boss-accent-hover text-white"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {isRunning ? (
        <span className="flex items-center gap-1.5">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t.app.runningWorkflow}
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          {t.app.runWorkflow}
        </span>
      )}
    </button>
  );
}

export default function App() {
  const project = useProjectStore((s) => s.project);
  const projects = useProjectStore((s) => s.projects);
  const rightPanel = useProjectStore((s) => s.rightPanel);
  const setRightPanel = useProjectStore((s) => s.setRightPanel);
  const importProject = useProjectStore((s) => s.importProject);
  const [showSettings, setShowSettings] = useState(false);
  const editingAgentId = useProjectStore((s) => s.editingAgentId);
  const setEditingAgentId = useProjectStore((s) => s.setEditingAgentId);
  const editingAgent = useProjectStore((s) => s.project?.agents.find((a) => a.agentId === editingAgentId) ?? null);
  const t = useT();

  useEffect(() => { applyAppTheme(); }, []);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Welcome modal — show when no projects at all */}
      {projects.length === 0 && <WelcomeModal />}
      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {editingAgent && (
        <RoleEditorModal agent={editingAgent} onClose={() => setEditingAgentId(null)} />
      )}

      {/* Top header */}
      <header className="h-12 flex items-center justify-between px-4 bg-boss-surface border-b border-boss-border select-none shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold tracking-wide text-boss-accent">
            {t.app.title}
          </h1>
          {project && (
            <>
              <span className="text-boss-border">/</span>
              <span className="text-sm text-boss-text truncate max-w-[200px]">
                {project.name}
              </span>
            </>
          )}
        </div>

        {project && (
          <div className="flex items-center gap-1.5">
            <RunButton />
            <button onClick={async () => { const p = await importWorkflowNative(); if (p) importProject(p); }}
              className="px-3 py-1.5 text-xs rounded-md text-boss-text-muted hover:text-boss-text hover:bg-boss-surface-hover transition-colors">
              {t.app.import}
            </button>
            <button onClick={() => project && exportWorkflow(project)}
              className="px-3 py-1.5 text-xs rounded-md text-boss-text-muted hover:text-boss-text hover:bg-boss-surface-hover transition-colors">
              {t.app.export}
            </button>
            <button onClick={() => setShowSettings(true)}
              className="px-3 py-1.5 text-xs rounded-md text-boss-text-muted hover:text-boss-text hover:bg-boss-surface-hover transition-colors"
              title={t.app.settingsTooltip}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {project && (
          <>
            <ReactFlowProvider>
              {/* Left: Project list */}
              <ProjectListPanel />

              {/* Center: Canvas */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Goal bar */}
                <GoalBar />
                {/* Progress bar */}
                <ProgressBar />
                <div className="flex-1 min-w-0">
                  <WorkflowCanvas />
                </div>
                {/* Bottom: Node type dock */}
                <BottomDock />
              </div>

              {/* Right panel */}
              {rightPanel === "properties" && <NodePropertiesPanel />}
            </ReactFlowProvider>
          </>
        )}
      </main>
    </div>
  );
}
