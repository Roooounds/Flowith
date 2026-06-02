import { useState, useCallback } from "react";
import { getLLMConfig, configureLLM } from "@/services/llmService";
import { getAppConfig, updateAppConfig, applyAppTheme } from "@/services/appConfig";
import type { FlowithAppConfig, ThemeMode } from "@/services/appConfig";
import { useLanguage, useT } from "@/i18n";
import { useProjectStore } from "@/stores/projectStore";
import type { LLMServiceConfig, CustomModelConfig } from "@/services/llmService";

import LogsPanel from "./LogsPanel";

type Tab = "llm" | "execution" | "cache" | "logs" | "general";

interface Props { onClose: () => void; }

export default function SettingsModal({ onClose }: Props) {
  const [llmCfg, setLlmCfg] = useState<LLMServiceConfig>(getLLMConfig());
  const [appCfg, setAppCfg] = useState<FlowithAppConfig>(getAppConfig());
  const { lang, setLanguage } = useLanguage();
  const t = useT();
  const [tab, setTab] = useState<Tab>("llm");

  // ── Factory reset ──────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (!confirm(t.settings.reset.confirm)) return;
    try {
      sessionStorage.setItem("boss_skip_auto_bootstrap", "1");
      useProjectStore.setState({ projects: [], activeProjectId: null, project: null, canvasNodes: [], canvasEdges: [] });
      localStorage.clear();
      try {
        const { clearAllData } = await import("@/services/databaseService");
        await clearAllData();
      } catch { /* SQLite not available */ }
      onClose();
    } catch (e) {
      console.error("[Reset] Failed:", e);
    }
  }, [t.settings.reset.confirm, onClose]);

  // ── LLM helpers ──
  const saveLlm = (partial: Partial<LLMServiceConfig>) => {
    const next = { ...llmCfg, ...partial };
    setLlmCfg(next);
    configureLLM(partial);
  };
  // ── App config helpers ──
  const saveApp = (partial: Partial<FlowithAppConfig>) => {
    const next = { ...appCfg, ...partial };
    setAppCfg(next);
    updateAppConfig(partial);
    applyAppTheme();
  };

  // ── Cloud model form state (LLM tab) ──
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addKey, setAddKey] = useState("");
  const [addEndpoint, setAddEndpoint] = useState("");
  const [addModelName, setAddModelName] = useState("");
  const [addedMsg, setAddedMsg] = useState("");
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editKey, setEditKey] = useState("");
  const [editEndpoint, setEditEndpoint] = useState("");
  const [editModel, setEditModel] = useState("");
  const [testStatus, setTestStatus] = useState<Record<string, "testing" | "ok" | "fail">>({});

  const runTest = async (id: string, provider: string, apiKey: string, model: string, endpoint?: string) => {
    setTestStatus(prev => ({ ...prev, [id]: "testing" }));
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("cloud_llm_call", { provider, apiKey, model, systemPrompt: "", prompt: "Hi", temperature: 0, endpoint: endpoint || "" });
      setTestStatus(prev => ({ ...prev, [id]: "ok" }));
      alert(t.settings.connected);
    } catch {
      setTestStatus(prev => ({ ...prev, [id]: "fail" }));
      alert(t.settings.connectionFailed);
    }
  };

  const addCustomModel = () => {
    if (!addKey.trim() || !addName.trim()) return;
    const m: CustomModelConfig = {
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      name: addName.trim(), provider: "custom" as CustomModelConfig["provider"],
      apiKey: addKey.trim(), endpoint: addEndpoint.trim() || undefined, model: addModelName.trim() || undefined,
    };
    saveLlm({ customModels: [...(llmCfg.customModels || []), m] });
    setShowAddForm(false); setAddName(""); setAddKey(""); setAddEndpoint(""); setAddModelName("");
    setAddedMsg(`✅ ${m.name} added!`); setTimeout(() => setAddedMsg(""), 3000);
  };

  const startEdit = (m: CustomModelConfig) => {
    setEditingModel(m.id); setEditName(m.name); setEditKey(m.apiKey); setEditEndpoint(m.endpoint || ""); setEditModel(m.model || "");
  };
  const saveEdit = () => {
    if (!editingModel || !editName.trim() || !editKey.trim()) return;
    saveLlm({ customModels: (llmCfg.customModels || []).map(m => m.id === editingModel ? { ...m, name: editName.trim(), apiKey: editKey.trim(), endpoint: editEndpoint.trim() || undefined, model: editModel.trim() || undefined } : m) });
    setEditingModel(null);
  };
  const removeModel = (id: string) => saveLlm({ customModels: (llmCfg.customModels || []).filter(m => m.id !== id) });

  // ── Tab rendering ──
  const tabs: { key: Tab; label: string }[] = [
    { key: "llm", label: t.settings.tabs.llm },
    { key: "execution", label: t.settings.tabs.execution },
    { key: "cache", label: t.settings.tabs.cache },
    { key: "logs", label: t.settings.tabs.logs },
    { key: "general", label: t.settings.tabs.general },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="panel w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-boss-border shrink-0">
          <h2 className="text-sm font-semibold text-boss-text">{t.settings.title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-boss-surface-hover text-boss-text-muted hover:text-boss-text"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-boss-border shrink-0 px-6 overflow-x-auto">
          {tabs.map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)} className={`px-3 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors ${tab === tb.key ? "border-boss-accent text-boss-accent" : "border-transparent text-boss-text-muted hover:text-boss-text"}`}>{tb.label}</button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ──── LLM ──── */}
          {tab === "llm" && (
            <>
              <div className="p-3 rounded-lg border border-boss-border bg-boss-bg/50">
                <div className="flex items-center justify-between">
                  <div><p className="text-xs font-semibold text-boss-text">{t.settings.executionMode}</p><p className="text-[9px] text-boss-text-muted mt-0.5">{llmCfg.mode === "real" ? t.settings.liveApi : t.settings.simulated}</p></div>
                  <button onClick={() => saveLlm({ mode: llmCfg.mode === "mock" ? "real" : "mock" })} className={`relative w-9 h-5 rounded-full transition-colors ${llmCfg.mode === "real" ? "bg-boss-success" : "bg-boss-border"}`}><div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${llmCfg.mode === "real" ? "translate-x-4" : "translate-x-0.5"}`} /></button>
                </div>
              </div>

              <div className="space-y-3"><p className="text-[10px] font-semibold text-boss-text uppercase tracking-wider">{t.settings.localImage}</p>
                <div className="p-3 rounded-lg border border-boss-border bg-boss-bg/50">
                  <div className="flex items-center gap-2 mb-2"><span>🖥️</span><span className="text-xs font-medium text-boss-text">{t.settings.ollama.label}</span></div>
                  <div className="flex items-center gap-2"><input type="text" value={llmCfg.ollamaBaseUrl} onChange={e => saveLlm({ ollamaBaseUrl: e.target.value })} placeholder={t.settings.ollama.placeholder} className="flex-1 px-3 py-1.5 bg-boss-bg border border-boss-border rounded text-xs font-mono text-boss-text focus:outline-none focus:border-boss-accent transition-colors" /><button onClick={() => fetch(`${llmCfg.ollamaBaseUrl}/api/tags`).then(r => r.ok ? alert(t.settings.connected) : alert(t.settings.connectionFailed)).catch(() => alert(t.settings.connectionFailed))} className="px-3 py-1.5 rounded border border-boss-border hover:border-boss-accent text-[10px] shrink-0">{t.settings.ollama.test}</button></div>
                </div>
                <div className="p-3 rounded-lg border border-boss-border bg-boss-bg/50">
                  <div className="flex items-center gap-2 mb-2"><span>🎨</span><span className="text-xs font-medium text-boss-text">{t.settings.comfyui.label}</span></div>
                  <div className="flex items-center gap-2"><input type="text" value={llmCfg.comfyuiBaseUrl || ""} onChange={e => saveLlm({ comfyuiBaseUrl: e.target.value })} placeholder={t.settings.comfyui.placeholder} className="flex-1 px-3 py-1.5 bg-boss-bg border border-boss-border rounded text-xs font-mono text-boss-text focus:outline-none focus:border-boss-accent transition-colors" /><button onClick={async () => { try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("test_comfyui_connection", { baseUrl: llmCfg.comfyuiBaseUrl || "http://localhost:8188" }); alert(t.settings.connected); } catch { alert(t.settings.connectionFailed); }}} className="px-3 py-1.5 rounded border border-boss-border hover:border-boss-accent text-[10px] shrink-0">{t.settings.ollama.test}</button></div>
                </div>
              </div>

              <div className="space-y-3"><p className="text-[10px] font-semibold text-boss-text uppercase tracking-wider">{t.settings.cloudModels}</p>
                {addedMsg && <p className="text-[10px] text-boss-success text-center">{addedMsg}</p>}
                {llmCfg.openaiApiKey && <ClickCard id="openai" icon="🤖" name="OpenAI" provider="openai" apiKey={llmCfg.openaiApiKey} model="gpt-4o" onTest={runTest} onRemove={() => saveLlm({ openaiApiKey: "" })} />}
                {llmCfg.anthropicApiKey && <ClickCard id="anthropic" icon="🧠" name="Anthropic" provider="anthropic" apiKey={llmCfg.anthropicApiKey} model="claude-sonnet-4-20250514" onTest={runTest} onRemove={() => saveLlm({ anthropicApiKey: "" })} />}
                {llmCfg.geminiApiKey && <ClickCard id="gemini" icon="🌟" name="Gemini" provider="gemini" apiKey={llmCfg.geminiApiKey} model="gemini-2.0-flash" onTest={runTest} onRemove={() => saveLlm({ geminiApiKey: "" })} />}
                {(llmCfg.customModels || []).map(m => (
                  <CustomCard key={m.id} model={m} isEditing={editingModel === m.id} testStatus={testStatus} editName={editName} editKey={editKey} editEndpoint={editEndpoint} editModel={editModel} onEditName={setEditName} onEditKey={setEditKey} onEditEndpoint={setEditEndpoint} onEditModel={setEditModel} onStartEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={() => setEditingModel(null)} onTest={runTest} onRemove={removeModel} t={t} />
                ))}
                {!llmCfg.openaiApiKey && !llmCfg.anthropicApiKey && !llmCfg.geminiApiKey && (llmCfg.customModels || []).length === 0 && <p className="text-[10px] text-boss-text-muted/50 text-center py-4">{t.settings.noCloudModels}</p>}
                {showAddForm ? (
                  <div className="p-3 rounded-lg border border-boss-accent/30 bg-boss-accent/5 space-y-2 shrink-0">
                    <div className="flex items-center justify-between"><p className="text-xs font-semibold text-boss-text">{t.settings.newCloudModel}</p><button onClick={() => setShowAddForm(false)} className="text-boss-text-muted hover:text-boss-text"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div>
                    <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder={t.settings.cloudModelForm.displayName} className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded text-xs text-boss-text focus:outline-none focus:border-boss-accent" />
                    <input type="password" value={addKey} onChange={e => setAddKey(e.target.value)} placeholder={t.settings.cloudModelForm.apiKey} className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded text-xs font-mono text-boss-text focus:outline-none focus:border-boss-accent" />
                    <input type="text" value={addEndpoint} onChange={e => setAddEndpoint(e.target.value)} placeholder={t.settings.cloudModelForm.endpoint} className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded text-xs font-mono text-boss-text focus:outline-none focus:border-boss-accent" />
                    <input type="text" value={addModelName} onChange={e => setAddModelName(e.target.value)} placeholder={t.settings.cloudModelForm.modelName} className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded text-xs font-mono text-boss-text focus:outline-none focus:border-boss-accent" />
                    <div className="flex gap-2 !mt-3">
                      <button onClick={() => setShowAddForm(false)} className="flex-1 py-1.5 rounded border border-boss-border text-[11px] text-boss-text-muted hover:text-boss-text transition-colors">{t.settings.cancel}</button>
                      <button onClick={addCustomModel} disabled={!addKey.trim() || !addName.trim()} className="flex-1 py-1.5 rounded bg-boss-accent hover:bg-boss-accent-hover text-white text-[11px] font-medium disabled:opacity-40">{t.settings.save}</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddForm(true)} className="w-full py-2 rounded-lg border border-dashed border-boss-border hover:border-boss-accent text-[11px] text-boss-text-muted hover:text-boss-accent transition-colors">{t.settings.addCloudModel}</button>
                )}
              </div>
            </>
          )}

          {/* ──── Execution ──── */}
          {tab === "execution" && (
            <>
              <p className="text-[10px] font-semibold text-boss-text uppercase tracking-wider">{t.settings.execution.sectionTitle}</p>

              {/* Timeout */}
              <SettingRow label={t.settings.execution.timeout} hint={t.settings.execution.timeoutHint}>
                <input type="range" min={15} max={300} step={15} value={appCfg.executionTimeoutMs / 1000}
                  onChange={e => saveApp({ executionTimeoutMs: parseInt(e.target.value) * 1000 })}
                  className="flex-1 accent-boss-accent" />
                <span className="text-xs font-mono text-boss-text w-10 text-right">{appCfg.executionTimeoutMs / 1000}s</span>
              </SettingRow>

              {/* Retries */}
              <SettingRow label={t.settings.execution.retries} hint={t.settings.execution.retriesHint}>
                <div className="flex items-center gap-2">
                  {[0, 1, 2, 3, 5].map(n => (
                    <button key={n} onClick={() => saveApp({ maxRetries: n })}
                      className={`w-9 py-1.5 rounded text-[11px] font-medium transition-colors ${appCfg.maxRetries === n ? "bg-boss-accent text-white" : "bg-boss-bg border border-boss-border text-boss-text-muted hover:border-boss-border-active"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {/* Concurrency */}
              <SettingRow label={t.settings.execution.concurrency} hint={t.settings.execution.concurrencyHint}>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 6, 8].map(n => (
                    <button key={n} onClick={() => saveApp({ maxConcurrency: n })}
                      className={`w-9 py-1.5 rounded text-[11px] font-medium transition-colors ${appCfg.maxConcurrency === n ? "bg-boss-accent text-white" : "bg-boss-bg border border-boss-border text-boss-text-muted hover:border-boss-border-active"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {/* Soft timeout */}
              <SettingRow label={t.settings.execution.softTimeout} hint={t.settings.execution.softTimeoutHint}>
                <button onClick={() => saveApp({ softTimeout: !appCfg.softTimeout })}
                  className={`relative w-9 h-5 rounded-full transition-colors ${appCfg.softTimeout ? "bg-boss-success" : "bg-boss-border"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${appCfg.softTimeout ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </SettingRow>
            </>
          )}

          {/* ──── Cache ──── */}
          {tab === "cache" && (
            <>
              <p className="text-[10px] font-semibold text-boss-text uppercase tracking-wider">{t.settings.cache.sectionTitle}</p>

              {/* Cache on/off */}
              <SettingRow label={t.settings.cache.enabled} hint={t.settings.cache.enabledHint}>
                <button onClick={() => saveApp({ cacheEnabled: !appCfg.cacheEnabled })}
                  className={`relative w-9 h-5 rounded-full transition-colors ${appCfg.cacheEnabled ? "bg-boss-success" : "bg-boss-border"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${appCfg.cacheEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </SettingRow>

              {/* Clear cache */}
              <button onClick={() => {
                if (confirm(t.settings.cache.clearConfirm)) {
                  try {
                    const keys = Object.keys(localStorage).filter(k => k.startsWith("flowith_cache_"));
                    keys.forEach(k => localStorage.removeItem(k));
                  } catch { /* ignore */ }
                  alert(t.settings.cache.cleared);
                }
              }} className="w-full py-2.5 rounded-lg border border-boss-error/30 text-xs text-boss-error hover:bg-boss-error/10 transition-colors">
                {t.settings.cache.clear}
              </button>
            </>
          )}

          {/* ──── Logs ──── */}
          {tab === "logs" && <LogsPanel />}

          {/* ──── General ──── */}
          {tab === "general" && (
            <>
              {/* Theme */}
              <p className="text-[10px] font-semibold text-boss-text uppercase tracking-wider">{t.settings.theme.sectionTitle}</p>
              <div className="grid grid-cols-3 gap-2">
                {(["dark", "light", "system"] as ThemeMode[]).map(theme => (
                  <button key={theme} onClick={() => saveApp({ theme })}
                    className={`p-3 rounded-lg border text-center transition-all ${appCfg.theme === theme ? "border-boss-accent bg-boss-accent/10 text-boss-accent" : "border-boss-border text-boss-text-muted hover:border-boss-border-active"}`}>
                    <p className="text-sm">{t.settings.theme[theme]}</p>
                  </button>
                ))}
              </div>

              {/* Language */}
              <div>
                <p className="text-[10px] font-semibold text-boss-text uppercase tracking-wider mb-2">{t.settings.general.language}</p>
                <select value={lang} onChange={e => setLanguage(e.target.value as "en" | "zh")}
                  className="w-full px-3 py-2.5 bg-boss-bg border border-boss-border rounded-lg text-sm text-boss-text focus:outline-none focus:border-boss-accent transition-colors">
                  <option value="en">{t.settings.general.english}</option>
                  <option value="zh">{t.settings.general.chinese}</option>
                </select>
              </div>

              {/* Shortcuts */}
              <div>
                <p className="text-[10px] font-semibold text-boss-text uppercase tracking-wider mb-2">{t.settings.shortcuts.sectionTitle}</p>
                <div className="p-3 rounded-lg border border-boss-border bg-boss-bg/50 space-y-1.5">
                  {Object.entries(t.settings.shortcuts.items).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between text-[10px]">
                      <span className="text-boss-text-muted">{label}</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-boss-bg border border-boss-border text-boss-text font-mono text-[9px]">
                        {key === "delete" ? "Del" : key === "escape" ? "Esc" : key === "enter" ? "Enter" : key === "ctrlZ" ? "⌘Z" : key === "ctrlShiftZ" ? "⌘⇧Z" : key === "ctrlS" ? "⌘S" : key === "space" ? "Space" : key}
                      </kbd>
                    </div>
                  ))}
                  <p className="text-[9px] text-boss-text-muted/50 pt-1">{t.settings.shortcuts.comingSoon}</p>
                </div>
              </div>

              {/* About */}
              <div className="p-4 rounded-lg bg-boss-bg border border-boss-border"><p className="text-[11px] font-semibold text-boss-text mb-1">{t.settings.general.about}</p><p className="text-[10px] text-boss-text-muted">{t.settings.general.description}</p><p className="text-[9px] text-boss-text-muted/50 mt-2">{t.settings.general.version}</p></div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-boss-border shrink-0 gap-2">
          <div className="flex items-center gap-2">
            <button onClick={async () => { try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("relaunch_launcher"); } catch { window.location.reload(); } }} className="px-3 py-1.5 rounded-lg border border-boss-border text-[10px] text-boss-text-muted hover:text-boss-text hover:border-boss-border-active transition-colors">{t.settings.redetect}</button>
            <button onClick={handleReset} className="px-3 py-1.5 rounded-lg border border-boss-error/30 text-[10px] text-boss-error hover:bg-boss-error/10">{t.settings.reset.button}</button>
          </div>
          <div className="flex items-center gap-2"><span className="text-[9px] text-boss-text-muted/50">{t.settings.footer.autoSaved}</span><button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-boss-accent hover:bg-boss-accent-hover text-white text-xs font-medium">{t.settings.footer.done}</button></div>
        </div>
      </div>
    </div>
  );
}

/* ──── Shared setting row ──── */
function SettingRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg border border-boss-border bg-boss-bg/50 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-boss-text">{label}</p>
        {children}
      </div>
      <p className="text-[9px] text-boss-text-muted/60">{hint}</p>
    </div>
  );
}

/* ──── Cloud model cards ──── */
function CustomCard({ model, isEditing, testStatus, editName, editKey, editEndpoint, editModel, onEditName, onEditKey, onEditEndpoint, onEditModel, onStartEdit, onSaveEdit, onCancelEdit, onTest, onRemove, t }: any) {
  if (isEditing) return (
    <div className="p-3 rounded-lg border border-boss-accent/30 bg-boss-accent/5 space-y-2">
      <input type="text" value={editName} onChange={e => onEditName(e.target.value)} className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded text-xs text-boss-text focus:outline-none focus:border-boss-accent" placeholder={t.settings.editModel.name} />
      <input type="password" value={editKey} onChange={e => onEditKey(e.target.value)} className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded text-xs font-mono text-boss-text focus:outline-none focus:border-boss-accent" placeholder={t.settings.editModel.apiKey} />
      {model.provider === "custom" && <input type="text" value={editEndpoint} onChange={e => onEditEndpoint(e.target.value)} className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded text-xs font-mono text-boss-text focus:outline-none focus:border-boss-accent" placeholder={t.settings.editModel.endpoint} />}
      <input type="text" value={editModel} onChange={e => onEditModel(e.target.value)} className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded text-xs font-mono text-boss-text focus:outline-none focus:border-boss-accent" placeholder={t.settings.editModel.modelName} />
      <div className="flex gap-2"><button onClick={onCancelEdit} className="flex-1 py-1 rounded border border-boss-border text-[10px]">{t.settings.cancel}</button><button onClick={onSaveEdit} className="flex-1 py-1 rounded bg-boss-accent text-white text-[10px] font-medium">{t.settings.save}</button></div>
    </div>
  );
  return (
    <div onClick={() => onTest(model.id, model.provider === "custom" ? "custom" : model.provider, model.apiKey, model.model || "gpt-3.5-turbo", model.endpoint)} className="p-3 rounded-lg border border-boss-border bg-boss-bg/50 hover:border-boss-border-active cursor-pointer transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span>🔌</span><span className="text-xs font-medium text-boss-text flex-1">{model.name}</span>
        <button onClick={e => { e.stopPropagation(); onRemove(model.id); }} className="text-boss-text-muted hover:text-boss-error"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-boss-text-muted/50 flex-1">{model.model ? model.model : ""}{model.endpoint ? ` · ${model.endpoint.split("//")[1]?.split("/")[0] || ""}` : ""}</span>
        <button onClick={e => { e.stopPropagation(); onStartEdit(model); }} className="px-3 py-1.5 rounded border border-boss-border hover:border-boss-accent text-[10px] shrink-0">{t.settings.editModel.edit}</button>
      </div>
    </div>
  );
}

function ClickCard({ id, icon, name, provider, apiKey, model, onTest, onRemove }: { id: string; icon: string; name: string; provider: string; apiKey: string; model: string; onTest: Function; onRemove: () => void }) {
  return (
    <div onClick={() => onTest(id, provider, apiKey, model)} className="p-3 rounded-lg border border-boss-border bg-boss-bg/50 hover:border-boss-border-active cursor-pointer transition-colors">
      <div className="flex items-center gap-2">
        <span>{icon}</span><span className="text-xs font-medium text-boss-text flex-1">{name}</span>
        <button onClick={e => { e.stopPropagation(); onRemove(); }} className="text-boss-text-muted hover:text-boss-error"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
      <p className="text-[9px] text-boss-text-muted/50 mt-1">{model}</p>
    </div>
  );
}
