import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import type { AgentProfile } from "@/types/project";

interface Props {
  agentId: string;
  children: React.ReactNode;
}

export default function AgentTooltip({ agentId, children }: Props) {
  const t = useT();
  const agent = useProjectStore((s) => {
    const agents = s.project?.agents ?? [];
    return agents.find((a) => a.agentId === agentId);
  });

  if (!agent) return <>{children}</>;

  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg bg-boss-surface border border-boss-border shadow-2xl opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-30">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-2">
          {agent.avatarEmoji?.startsWith("data:") ? (
            <img src={agent.avatarEmoji} className="w-10 h-10 rounded-full object-cover border border-boss-border shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-boss-bg border border-boss-border flex items-center justify-center text-xl shrink-0">
              {agent.avatarEmoji || "👤"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-boss-text truncate">{agent.name}</p>
            {agent.category && <p className="text-[9px] text-boss-accent">{agent.category}</p>}
          </div>
        </div>

        {/* Model & Provider */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-boss-accent/10 text-boss-accent font-mono">{agent.provider === "local_ollama" ? t.agentTooltip.local : agent.provider === "cloud_openai" ? t.agentTooltip.openai : t.agentTooltip.anthropic}</span>
          <span className="text-[9px] text-boss-text-muted/70 font-mono truncate">{agent.modelName || "—"}</span>
        </div>

        {/* System prompt preview */}
        {agent.systemPrompt && (
          <p className="text-[9px] text-boss-text-muted leading-relaxed mb-2 line-clamp-3 border-l-2 border-boss-border pl-2">
            {agent.systemPrompt}
          </p>
        )}

        {/* Footer stats */}
        <div className="flex items-center gap-2 text-[9px] text-boss-text-muted/50">
          <span>{t.agentTooltip.temp} {agent.temperature.toFixed(1)}</span>
          {agent.toolsAllowed.length > 0 && (
            <span>{t.agentTooltip.tools} {agent.toolsAllowed.length}</span>
          )}
        </div>
      </div>
    </div>
  );
}
