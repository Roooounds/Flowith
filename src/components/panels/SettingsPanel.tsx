import { useState } from "react";
import { getLLMConfig, configureLLM } from "@/services/llmService";
import type { LLMServiceConfig } from "@/services/llmService";

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<LLMServiceConfig>(getLLMConfig());
  const [openaiVisible, setOpenaiVisible] = useState(false);
  const [anthropicVisible, setAnthropicVisible] = useState(false);

  const save = (partial: Partial<LLMServiceConfig>) => {
    const next = { ...cfg, ...partial };
    setCfg(next);
    configureLLM(partial);
  };

  return (
    <aside className="w-72 shrink-0 bg-boss-surface border-l border-boss-border flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-boss-border shrink-0">
        <h2 className="text-sm font-semibold text-boss-text">Settings</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-boss-surface-hover text-boss-text-muted hover:text-boss-text transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Mode toggle */}
        <div>
          <label className="block text-[11px] font-medium text-boss-text-muted mb-1">Mode</label>
          <div className="flex gap-1">
            <button onClick={() => save({ mode: "mock" })}
              className={`flex-1 py-1.5 text-[11px] rounded-md transition-colors ${cfg.mode === "mock" ? "bg-boss-accent/15 text-boss-accent border border-boss-accent/30" : "border border-boss-border text-boss-text-muted hover:text-boss-text"}`}
            >Mock</button>
            <button onClick={() => save({ mode: "real" })}
              className={`flex-1 py-1.5 text-[11px] rounded-md transition-colors ${cfg.mode === "real" ? "bg-boss-success/15 text-boss-success border border-boss-success/30" : "border border-boss-border text-boss-text-muted hover:text-boss-text"}`}
            >Real</button>
          </div>
        </div>

        {/* Ollama */}
        <div>
          <label className="block text-[11px] font-medium text-boss-text-muted mb-1">Ollama Base URL</label>
          <input type="text" value={cfg.ollamaBaseUrl} onChange={(e) => save({ ollamaBaseUrl: e.target.value })}
            placeholder="http://localhost:11434" className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-sm font-mono text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors" />
        </div>

        {/* OpenAI */}
        <div>
          <button onClick={() => setOpenaiVisible(!openaiVisible)}
            className="w-full flex items-center justify-between text-[11px] font-medium text-boss-text-muted mb-1 hover:text-boss-text transition-colors"
          >
            OpenAI API Key
            <svg className={`w-3 h-3 transition-transform ${openaiVisible ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
          {openaiVisible && (
            <input type="password" value={cfg.openaiApiKey} onChange={(e) => save({ openaiApiKey: e.target.value })}
              placeholder="sk-..." className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-sm font-mono text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors" />
          )}
        </div>

        {/* Anthropic */}
        <div>
          <button onClick={() => setAnthropicVisible(!anthropicVisible)}
            className="w-full flex items-center justify-between text-[11px] font-medium text-boss-text-muted mb-1 hover:text-boss-text transition-colors"
          >
            Anthropic API Key
            <svg className={`w-3 h-3 transition-transform ${anthropicVisible ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
          {anthropicVisible && (
            <input type="password" value={cfg.anthropicApiKey} onChange={(e) => save({ anthropicApiKey: e.target.value })}
              placeholder="sk-ant-..." className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-sm font-mono text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors" />
          )}
        </div>

        {/* Status */}
        <div className="p-3 rounded-lg bg-boss-bg border border-boss-border">
          <p className="text-[10px] text-boss-text-muted">
            Current mode: <span className={cfg.mode === "real" ? "text-boss-success font-semibold" : "text-boss-warning font-semibold"}>{cfg.mode.toUpperCase()}</span>
          </p>
          <p className="text-[10px] text-boss-text-muted/50 mt-1">
            {cfg.mode === "real"
              ? "API calls will use real keys. Check provider settings below."
              : "Mock mode returns simulated responses for testing."}
          </p>
        </div>
      </div>
    </aside>
  );
}
