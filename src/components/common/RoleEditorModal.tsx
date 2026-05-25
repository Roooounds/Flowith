import { useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useOllamaModels } from "@/hooks/useOllamaModels";
import { matchModel } from "@/services/modelMatcher";
import { useComfyUIModels } from "@/hooks/useComfyUIModels";
import { getLLMConfig } from "@/services/llmService";
import { useT } from "@/i18n";
import ConversationalOnboarding from "@/components/panels/ConversationalOnboarding";
import type { AgentProfile, ProviderType, ToolPermission } from "@/types/project";

interface Props {
  agent?: AgentProfile | null; // null = new role
  onClose: () => void;
}

const PROVIDER_KEYS: ProviderType[] = ["local_ollama", "cloud_openai", "cloud_anthropic", "comfyui"];

const CLOUD_MODELS: Record<string, string[]> = {
  cloud_openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o3-mini"],
  cloud_anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  cloud_gemini: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro", "gemini-1.5-flash"],
};
const TOOL_KEYS: ToolPermission[] = ["web_search", "comfyui_render", "file_read", "file_write", "code_execution", "image_generation"];

const EMPTY: Omit<AgentProfile, "agentId" | "createdAt" | "updatedAt"> = {
  name: "", avatarEmoji: "👤", category: "", provider: "local_ollama", modelName: "",
  systemPrompt: "", temperature: 0.4, toolsAllowed: [],
};

export default function RoleEditorModal({ agent, onClose }: Props) {
  const addAgent = useProjectStore((s) => s.addAgent);
  const updateAgent = useProjectStore((s) => s.updateAgent);
  const t = useT();
  const { models: ollamaModels, loading: ollamaLoading, refresh: refreshOllama } = useOllamaModels();
  const { models: comfyModels, loading: comfyLoading, error: comfyError, refresh: refreshComfy } = useComfyUIModels();
  const isNew = !agent;
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [form, setForm] = useState(agent ? {
    name: agent.name, avatarEmoji: agent.avatarEmoji || "👤", category: agent.category || "",
    provider: agent.provider, modelName: agent.modelName, systemPrompt: agent.systemPrompt,
    temperature: agent.temperature, toolsAllowed: [...agent.toolsAllowed],
  } : EMPTY);

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (isNew) addAgent(form);
    else updateAgent(agent!.agentId, form);
    onClose();
  };

  const toggleTool = (tool: ToolPermission) => {
    setForm((f) => ({ ...f, toolsAllowed: f.toolsAllowed.includes(tool) ? f.toolsAllowed.filter((t) => t !== tool) : [...f.toolsAllowed, tool] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="panel w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-boss-border shrink-0">
          <h3 className="text-sm font-semibold text-boss-text">{isNew ? t.roleEditor.newRole : t.roleEditor.editRole}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-boss-surface-hover text-boss-text-muted hover:text-boss-text transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {showOnboarding ? (
          <ConversationalOnboarding
            onApply={(result) => {
              setForm((f) => ({ ...f, name: result.name, avatarEmoji: result.avatarEmoji, category: result.category, systemPrompt: result.systemPrompt, temperature: result.temperature }));
              setShowOnboarding(false);
            }}
            onClose={() => setShowOnboarding(false)}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <button onClick={() => setShowOnboarding(true)}
              className="w-full py-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-rose-500/10 border border-purple-500/20 hover:border-purple-400/40 text-xs text-purple-400 hover:text-purple-300 transition-all flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              {t.roleEditor.aiGenerate}
            </button>

            <div className="flex items-center gap-3">
              <label className="relative cursor-pointer group shrink-0">
                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 w-0 h-0"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setForm((f) => ({ ...f, avatarEmoji: reader.result as string }));
                    reader.readAsDataURL(file);
                  }} />
                {form.avatarEmoji?.startsWith("data:") ? (
                  <div className="relative">
                    <img src={form.avatarEmoji} className="w-20 h-20 rounded-full object-cover border-2 border-boss-border group-hover:border-boss-accent transition-colors" />
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); setForm((f) => ({ ...f, avatarEmoji: "👤" })); }}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-boss-error text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
                ) : (
                  <div className="relative">
                    <span className="w-20 h-20 rounded-full bg-boss-bg border-2 border-boss-border group-hover:border-boss-accent flex items-center justify-center text-4xl transition-colors">
                      {form.avatarEmoji || "👤"}
                    </span>
                    <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-boss-accent text-white text-[10px] flex items-center justify-center">+</span>
                  </div>
                )}
              </label>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t.agentManager.namePlaceholder} autoFocus
                className="flex-1 px-3 py-1.5 bg-boss-bg border border-boss-border rounded-lg text-sm text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors" />
            </div>

            <div className="flex items-center gap-2">
              <input type="text" value={form.category ?? ""} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder={t.roleEditor.category} className="w-24 px-3 py-1.5 bg-boss-bg border border-boss-border rounded-lg text-xs text-boss-text focus:outline-none focus:border-boss-accent transition-colors" />
              <ProviderSelector form={form} setForm={setForm} t={t} />
            </div>

            <div>
              {form.provider === "local_ollama" ? (
                <div>
                  <select value={form.modelName} onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))}
                    className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded-lg text-sm font-mono text-boss-text focus:outline-none focus:border-boss-accent transition-colors">
                    <option value="">{ollamaLoading ? t.roleEditor.detecting : ollamaModels.length === 0 ? t.roleEditor.noModels : t.roleEditor.selectModel}</option>
                    {ollamaModels.map((m) => (<option key={m.name} value={m.name}>{m.name} ({m.size})</option>))}
                  </select>
                  <div className="flex items-center gap-3 mt-1">
                    <button onClick={refreshOllama} className="text-[9px] text-boss-accent hover:text-boss-accent-hover transition-colors">{t.roleEditor.refresh}</button>
                    {ollamaModels.length > 0 && (
                      <button onClick={() => {
                        const m = matchModel(form.category || undefined, ollamaModels);
                        if (m) setForm((f) => ({ ...f, modelName: m }));
                      }} className="text-[9px] text-boss-accent hover:text-boss-accent-hover transition-colors">{t.roleEditor.autoMatch}</button>
                    )}
                  </div>
                </div>
              ) : form.provider === "comfyui" ? (
                <div>
                  {comfyLoading ? (
                    <p className="text-xs text-boss-text-muted py-1">{t.roleEditor.detectingCheckpoints}</p>
                  ) : comfyModels.length > 0 ? (
                    <select value={form.modelName} onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))}
                      className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded-lg text-sm font-mono text-boss-text focus:outline-none focus:border-boss-accent transition-colors">
                      <option value="">{t.roleEditor.selectCheckpoint}</option>
                      {comfyModels.map((m) => (<option key={m.name} value={m.name}>{m.name}</option>))}
                    </select>
                  ) : comfyError ? (
                    <p className="text-[10px] text-boss-error">{comfyError}</p>
                  ) : (
                    <p className="text-xs text-boss-text-muted">{t.roleEditor.noCheckpoints}</p>
                  )}
                  <button onClick={refreshComfy} className="mt-1 text-[9px] text-boss-accent hover:text-boss-accent-hover transition-colors">{t.roleEditor.refresh}</button>
                </div>
              ) : form.provider === "cloud_custom" ? (
                <ModelInputForCustom form={form} setForm={setForm} t={t} />
              ) : (
                <div>
                  <select value={form.modelName} onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))}
                    className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded-lg text-sm font-mono text-boss-text focus:outline-none focus:border-boss-accent transition-colors">
                    <option value="">{t.roleEditor.selectCloudModel}</option>
                    {CLOUD_MODELS[form.provider]?.map((m) => (<option key={m} value={m}>{m}</option>))}
                  </select>
                  <input type="text" value={CLOUD_MODELS[form.provider]?.includes(form.modelName) ? "" : form.modelName} onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))}
                    placeholder={t.roleEditor.customModelPlaceholder}
                    className="w-full mt-1 px-3 py-1 bg-boss-bg border border-boss-border rounded text-[11px] font-mono text-boss-text-muted placeholder:text-boss-text-muted/30 focus:outline-none focus:border-boss-accent transition-colors" />
                </div>
              )}
            </div>

            <textarea value={form.systemPrompt} onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder={t.agentManager.systemPromptPlaceholder} rows={10}
              className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-xs text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors resize-y font-mono" />

            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="text-[10px] font-medium text-boss-text-muted">{t.agentManager.temperature}: {form.temperature.toFixed(1)}</label>
                <span className="relative group/info cursor-help text-boss-text-muted/40 hover:text-boss-text-muted transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 p-2 rounded bg-boss-bg border border-boss-border text-[10px] text-boss-text leading-relaxed opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none shadow-lg z-30">
                    {t.roleEditor.temperatureTooltip}
                  </div>
                </span>
              </div>
              <input type="range" min={0} max={2} step={0.1} value={form.temperature}
                onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))} className="w-full accent-boss-accent" />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-boss-text-muted mb-1">{t.agentManager.toolPermissions}</label>
              <div className="grid grid-cols-2 gap-1">
                {TOOL_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-boss-surface-hover cursor-pointer transition-colors">
                    <input type="checkbox" checked={form.toolsAllowed.includes(key)} onChange={() => toggleTool(key)} className="accent-boss-accent rounded" />
                    <span className="text-[10px] text-boss-text">{t.agentManager.toolLabels[key]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {!showOnboarding && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-boss-border shrink-0">
            <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-boss-border text-xs text-boss-text-muted hover:text-boss-text transition-colors">{t.roleEditor.cancel}</button>
            <button onClick={handleSave} disabled={!form.name.trim()}
              className="flex-1 py-2 rounded-lg bg-boss-accent hover:bg-boss-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {isNew ? t.roleEditor.create : t.roleEditor.save}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ModelInputForCustom({ form, setForm, t }: { form: any; setForm: any; t: any }) {
  const cfg = getLLMConfig();
  const customModel = cfg.customModels?.find(m => m.name === form.modelName);
  const defaultModel = customModel?.model || "";
  const isUsingDefault = defaultModel && form.modelName === defaultModel;

  return (
    <div>
      {defaultModel ? (
        <div className="flex items-center gap-2">
          <input type="text" value={isUsingDefault ? defaultModel : form.modelName}
            onChange={(e) => setForm((f: any) => ({ ...f, modelName: e.target.value }))}
            className="flex-1 px-3 py-1.5 bg-boss-bg border border-boss-border rounded-lg text-sm font-mono text-boss-text focus:outline-none focus:border-boss-accent transition-colors" />
          <button onClick={() => setForm((f: any) => ({ ...f, modelName: isUsingDefault ? "" : defaultModel }))}
            className="text-[9px] text-boss-accent hover:text-boss-accent-hover shrink-0">
            {isUsingDefault ? t.roleEditor.editLabel : t.roleEditor.reset}
          </button>
        </div>
      ) : (
        <input type="text" value={form.modelName || ""} onChange={(e) => setForm((f: any) => ({ ...f, modelName: e.target.value }))}
          placeholder={t.roleEditor.enterModelName}
          className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded-lg text-sm font-mono text-boss-text focus:outline-none focus:border-boss-accent transition-colors" />
      )}
    </div>
  );
}

function ProviderSelector({ form, setForm, t }: { form: any; setForm: any; t: any }) {
  const cfg = getLLMConfig();
  const customModels = cfg.customModels || [];
  const DEFAULT_CLOUD = [
    { provider: "cloud_openai", label: "OpenAI" },
    { provider: "cloud_anthropic", label: "Anthropic" },
    { provider: "cloud_gemini", label: "Gemini" },
  ];

  const isCustomActive = form.provider === "cloud_custom";
  const customActiveName = customModels.find(m => form.customProviderId === m.id)?.name;
  const showDefaultCloud = !isCustomActive;

  return (
    <div className="flex-1 space-y-1">
      {/* Local */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-boss-text-muted/50 w-10 shrink-0">{t.roleEditor.local}</span>
        <button onClick={() => setForm((f: any) => ({ ...f, provider: "local_ollama", customProviderId: undefined }))}
          className={`flex-1 py-1.5 text-[10px] rounded-md transition-colors ${form.provider === "local_ollama" ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30" : "border border-boss-border text-boss-text-muted hover:text-boss-text"}`}>
          {t.roleEditor.ollama}
        </button>
      </div>
      {/* Cloud */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-boss-text-muted/50 w-10 shrink-0">{t.roleEditor.cloud}</span>
        <div className="flex-1 flex flex-wrap gap-1">
          {showDefaultCloud && DEFAULT_CLOUD.map(dc => (
            <button key={dc.provider} onClick={() => setForm((f: any) => ({ ...f, provider: dc.provider, customProviderId: undefined }))}
              className={`py-1.5 px-2 text-[10px] rounded-md transition-colors ${form.provider === dc.provider ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30" : "border border-boss-border text-boss-text-muted hover:text-boss-text"}`}>
              {dc.provider === "cloud_openai" ? t.roleEditor.openai : dc.provider === "cloud_anthropic" ? t.roleEditor.anthropic : t.roleEditor.gemini}
            </button>
          ))}
          {customModels.map(cm => (
            <button key={cm.id} onClick={() => setForm((f: any) => ({ ...f, provider: "cloud_custom", customProviderId: cm.id, modelName: cm.name }))}
              className={`py-1.5 px-2 text-[10px] rounded-md transition-colors ${isCustomActive && form.customProviderId === cm.id ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30" : "border border-boss-border text-boss-text-muted hover:text-boss-text"}`}>
              {cm.name}
            </button>
          ))}
          {customModels.length === 0 && !showDefaultCloud && (
            <span className="text-[10px] text-boss-text-muted/50">{t.roleEditor.addModelsHint}</span>
          )}
        </div>
      </div>
      {/* Image */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-boss-text-muted/50 w-10 shrink-0">{t.roleEditor.image}</span>
        <button onClick={() => setForm((f: any) => ({ ...f, provider: "comfyui", customProviderId: undefined }))}
          className={`flex-1 py-1.5 text-[10px] rounded-md transition-colors ${form.provider === "comfyui" ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30" : "border border-boss-border text-boss-text-muted hover:text-boss-text"}`}>
          {t.roleEditor.comfyui}
        </button>
      </div>
    </div>
  );
}
