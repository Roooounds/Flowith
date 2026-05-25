import { useState } from "react";
import { llmService } from "@/services/llmService";
import { useT } from "@/i18n";
import type { AgentProfile } from "@/types/project";

interface Props {
  onApply: (result: {
    name: string;
    avatarEmoji: string;
    category: string;
    systemPrompt: string;
    temperature: number;
  }) => void;
  onClose: () => void;
}

const META_PROMPT = `You are a role configuration assistant for an AI workflow tool. A user will describe what kind of AI assistant they need. Your job is to generate a structured role configuration.

Output ONLY a JSON object with these fields (no markdown, no explanation):
{
  "name": "A concise Chinese role title (max 15 chars)",
  "avatarEmoji": "A single relevant emoji",
  "category": "One of: 文案, 设计, 开发, 分析, 产品, 审核, 其他",
  "systemPrompt": "A detailed system prompt covering: role, expertise, style, constraints, and output format. Use Chinese. Keep it professional and specific. Include guidelines for how the AI should respond.",
  "temperature": 0.7
}

The user's description is:`;

export default function ConversationalOnboarding({ onApply, onClose }: Props) {
  const t = useT();
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      // Use a hardcoded local config for meta-prompting (no need for real API keys)
      const savedMode = llmService.getMode();
      llmService.setMode("mock");

      const rawPrompt = `${META_PROMPT}\n\n"${description.trim()}"`;

      // Call with a generic agent profile for meta-prompting
      const response = await llmService.call(
        {
          agentId: "meta",
          name: "Meta Prompt Generator",
          provider: "cloud_anthropic",
          modelName: "claude-sonnet-4-20250514",
          systemPrompt: "You are a role configuration generator. Output clean JSON only.",
          temperature: 0.3,
          toolsAllowed: [],
          createdAt: "",
          updatedAt: "",
        },
        rawPrompt
      );

      llmService.setMode(savedMode);

      // Parse the JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");

      const result = JSON.parse(jsonMatch[0]);

      // Validate
      if (!result.name || !result.systemPrompt) {
        throw new Error("Missing required fields in generated config");
      }

      setPreview(result.systemPrompt);
      onApply({
        name: result.name || description.slice(0, 15),
        avatarEmoji: result.avatarEmoji || "🤖",
        category: result.category || "其他",
        systemPrompt: result.systemPrompt,
        temperature: result.temperature ?? 0.7,
      });
    } catch (err: any) {
      setError(err?.message || t.conversationalOnboarding.generationFailed);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-boss-border shrink-0">
        <h3 className="text-xs font-semibold text-boss-text">{t.conversationalOnboarding.title}</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-boss-surface-hover text-boss-text-muted hover:text-boss-text transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Description input */}
      <div className="p-3 space-y-3 flex-1 flex flex-col">
        <p className="text-[10px] text-boss-text-muted leading-relaxed">
          {t.conversationalOnboarding.description}
        </p>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.conversationalOnboarding.placeholder}
          rows={6}
          className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-sm text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors resize-none"
          disabled={generating}
        />

        <button
          onClick={handleGenerate}
          disabled={!description.trim() || generating}
          className="w-full py-2 rounded-lg bg-boss-accent hover:bg-boss-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t.conversationalOnboarding.generating}
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              {t.conversationalOnboarding.generateButton}
            </>
          )}
        </button>

        {error && (
          <div className="p-2 rounded bg-boss-error/10 border border-boss-error/20 text-[10px] text-boss-error">
            {error}
          </div>
        )}

        {preview && (
          <div className="flex-1 min-h-0">
            <p className="text-[10px] text-boss-text-muted mb-1">{t.conversationalOnboarding.generatedPrompt}</p>
            <div className="p-2.5 rounded bg-boss-bg border border-boss-border max-h-32 overflow-y-auto">
              <pre className="text-[10px] text-boss-text-muted font-mono whitespace-pre-wrap leading-relaxed">{preview}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
