import { useState, useEffect } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useT, useLanguage } from "@/i18n";
import { selectProjectFolder, hasFolderAccess } from "@/services/fileStorage";

const DEMO_KEYS = ["demo1", "demo2", "demo3", "demo4", "demo5", "demo6", "demo7"] as const;
const LOADERS = {
  demo1: (s: ReturnType<typeof useProjectStore.getState>) => s.loadDemoProject,
  demo2: (s: ReturnType<typeof useProjectStore.getState>) => s.loadDemoCustomerService,
  demo3: (s: ReturnType<typeof useProjectStore.getState>) => s.loadDemoCodeReview,
  demo4: (s: ReturnType<typeof useProjectStore.getState>) => s.loadDemoMarketing,
  demo5: (s: ReturnType<typeof useProjectStore.getState>) => s.loadDemoDataAnalysis,
  demo6: (s: ReturnType<typeof useProjectStore.getState>) => s.loadDemoInfluencerContent,
  demo7: (s: ReturnType<typeof useProjectStore.getState>) => s.loadDemoComfyUI,
};

export default function WelcomeModal() {
  const createProject = useProjectStore((s) => s.createProject);
  const loadAllDemos = useProjectStore((s) => s.loadAllDemos);
  const bootstrapDemos = useProjectStore((s) => s.bootstrapDemos);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const t = useT();
  const { lang, setLanguage } = useLanguage();

  // Skip auto-bootstrap on first launch to prevent Ollama fetch from hanging the UI.
  // User can load demos manually from the WelcomeModal buttons.
  useEffect(() => {
    sessionStorage.removeItem("boss_skip_auto_bootstrap");
    setBootstrapping(false);
  }, []);

  const handlePickFolder = async () => {
    setPicking(true);
    const folderName = await selectProjectFolder();
    if (folderName) setFolder(folderName);
    setPicking(false);
  };

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createProject(trimmed, description.trim(), folder ?? undefined);
  };

  // Show loading state while auto-detecting Ollama models
  if (bootstrapping) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="panel w-full max-w-lg p-8 shadow-2xl flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-boss-accent/15 flex items-center justify-center">
            <svg className="w-7 h-7 text-boss-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-boss-text">{t.welcome.heading}</h2>
          <div className="flex items-center gap-2 text-sm text-boss-text-muted">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Detecting local AI models...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="panel w-full max-w-lg p-8 shadow-2xl relative">
        {/* Language selector — top right */}
        <select
          value={lang}
          onChange={e => setLanguage(e.target.value as "en" | "zh")}
          className="absolute top-3 right-3 px-2 py-1 text-[11px] rounded-md border border-boss-border bg-boss-bg text-boss-text-muted focus:outline-none focus:border-boss-accent font-mono cursor-pointer"
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>

        <div className="mb-6 flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-boss-accent/15 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-boss-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-center text-boss-text mb-1">
          {t.welcome.heading}
        </h2>
        <p className="text-sm text-center text-boss-text-muted mb-8">
          {t.welcome.subheading}
        </p>

        <label className="block text-xs font-medium text-boss-text-muted mb-1.5">
          {t.welcome.projectName}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder={t.welcome.projectNamePlaceholder}
          className="w-full px-3 py-2.5 bg-boss-bg border border-boss-border rounded-lg text-sm text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors mb-4"
          autoFocus
        />

        <label className="block text-xs font-medium text-boss-text-muted mb-1.5">
          {t.welcome.projectDesc}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.welcome.projectDescPlaceholder}
          rows={3}
          className="w-full px-3 py-2.5 bg-boss-bg border border-boss-border rounded-lg text-sm text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors resize-none mb-4"
        />

        {/* Folder picker */}
        <label className="block text-xs font-medium text-boss-text-muted mb-1.5">
          {t.welcome.projectFolder}
        </label>
        <button
          onClick={handlePickFolder}
          disabled={picking}
          className="w-full px-3 py-2.5 bg-boss-bg border border-dashed border-boss-border hover:border-boss-accent/50 rounded-lg text-sm text-boss-text-muted hover:text-boss-text transition-colors mb-6 flex items-center gap-2 disabled:opacity-50"
        >
          <svg className="w-4 h-4 text-boss-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          <span className="truncate">{folder || (picking ? t.welcome.selecting : t.welcome.selectFolder)}</span>
        </button>

        <button
          onClick={handleCreate}
          disabled={!name.trim()}
          className="w-full py-2.5 rounded-lg bg-boss-accent hover:bg-boss-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t.welcome.createBtn}
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-boss-border" />
          <span className="text-[10px] text-boss-text-muted uppercase tracking-wider">{t.welcome.or}</span>
          <div className="flex-1 h-px bg-boss-border" />
        </div>

        <button
          onClick={() => bootstrapDemos(lang)}
          className="w-full py-2.5 rounded-lg border border-boss-accent/40 bg-boss-accent/10 hover:bg-boss-accent/20 text-boss-accent text-sm font-medium transition-colors"
        >
          {t.welcome.loadAllDemos}
        </button>

        <p className="text-xs font-medium text-boss-text-muted mt-4 mb-2">
          {t.welcome.demos.title}
        </p>

        <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
          {DEMO_KEYS.map((key) => {
            const demo = t.welcome.demos[key];
            const loader = LOADERS[key];
            return (
              <button
                key={key}
                onClick={() => {
                  const store = useProjectStore.getState();
                  loader(store)(lang);
                }}
                className="w-full text-left px-3 py-2 rounded-lg border border-boss-border hover:border-boss-accent/40 hover:bg-boss-accent/5 transition-colors group"
              >
                <div className="text-sm text-boss-text group-hover:text-boss-accent transition-colors font-medium">
                  {demo.name}
                </div>
                <div className="text-[11px] text-boss-text-muted mt-0.5 leading-relaxed">
                  {demo.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
