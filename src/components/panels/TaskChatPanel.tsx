import { useState, useRef, useEffect, useCallback } from "react";
import { refineOutput, type RefinementMessage } from "@/services/conversationalTuning";
import type { AgentProfile } from "@/types/project";
import { useT } from "@/i18n";

// ─── Module-level chat state cache ───────────────────────────────
// Survives component unmount/remount during workflow re-execution.

interface CachedChatState {
  history: RefinementMessage[];
  draftOutput: string | null;
  /** The currentOutput value when this chat was started / last synced */
  baseOutput: string | null;
}

const chatCache = new Map<string, CachedChatState>();

function loadChatState(nodeId: string, currentOutput: string | null): CachedChatState {
  const cached = chatCache.get(nodeId);
  if (cached && cached.baseOutput !== currentOutput) {
    chatCache.delete(nodeId);
    return { history: [], draftOutput: null, baseOutput: currentOutput };
  }
  return cached ?? { history: [], draftOutput: null, baseOutput: currentOutput };
}

function saveChatState(nodeId: string, state: CachedChatState) {
  chatCache.set(nodeId, state);
}

// ─── Props ────────────────────────────────────────────────────────

interface TaskChatPanelProps {
  nodeId: string;
  agent: AgentProfile | null;
  instruction: string;
  currentOutput: string | null;
  onApplyOutput: (output: string) => void;
  onApplyAndRerunDownstream: (output: string) => void;
  onDiscard: () => void;
}

// ─── Component ────────────────────────────────────────────────────

export default function TaskChatPanel({
  nodeId,
  agent,
  instruction,
  currentOutput,
  onApplyOutput,
  onApplyAndRerunDownstream,
  onDiscard,
}: TaskChatPanelProps) {
  const t = useT();
  const [cached, setCached] = useState(() => loadChatState(nodeId, currentOutput));
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionTaken, setActionTaken] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const prevOutputRef = useRef(currentOutput);
  useEffect(() => {
    if (currentOutput !== prevOutputRef.current) {
      prevOutputRef.current = currentOutput;
      if (currentOutput !== cached.draftOutput) {
        setCached(loadChatState(nodeId, currentOutput));
        setActionTaken(false);
      }
    }
  }, [currentOutput, nodeId, cached.draftOutput]);

  useEffect(() => {
    saveChatState(nodeId, cached);
  }, [nodeId, cached]);

  const history = cached.history;
  const draftOutput = cached.draftOutput;

  const hasPendingChanges = draftOutput !== null && draftOutput !== currentOutput;
  const showActions = hasPendingChanges && !actionTaken;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, loading, showActions]);

  const handleSend = useCallback(async () => {
    if (!feedback.trim() || !agent || loading) return;

    const userContent = feedback.trim();
    setFeedback("");
    setError(null);
    setLoading(true);

    const userMsg: RefinementMessage = {
      role: "user",
      content: userContent,
      timestamp: new Date().toISOString(),
    };
    setCached((prev) => ({
      ...prev,
      history: [...prev.history, userMsg],
    }));

    try {
      const baseOutput = draftOutput ?? currentOutput ?? "";
      const result = await refineOutput(
        agent,
        instruction,
        baseOutput,
        history,
        userContent,
      );

      const assistantMsg = result.updatedHistory[result.updatedHistory.length - 1];
      setCached((prev) => ({
        history: [...prev.history, assistantMsg],
        draftOutput: result.output,
        baseOutput: prev.baseOutput,
      }));
      setActionTaken(false);
    } catch (err: any) {
      setError(err?.message ?? t.taskChat.refinementFailed);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [feedback, agent, instruction, currentOutput, draftOutput, history, loading, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApply = () => {
    if (draftOutput) {
      onApplyOutput(draftOutput);
      setActionTaken(true);
      prevOutputRef.current = draftOutput;
    }
  };

  const handleApplyAndRerun = () => {
    if (draftOutput) {
      onApplyAndRerunDownstream(draftOutput);
      setActionTaken(true);
      prevOutputRef.current = draftOutput;
    }
  };

  const handleDiscardLocal = () => {
    chatCache.delete(nodeId);
    setCached({ history: [], draftOutput: null, baseOutput: currentOutput });
    setActionTaken(true);
    onDiscard();
  };

  const showEmptyState = history.length === 0 && !loading;
  const thinkingText = `${agent?.name ?? "AI"}${t.taskChat.thinking}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0"
      >
        {showEmptyState ? (
          <EmptyState
            currentOutput={currentOutput}
            instruction={instruction}
            t={t}
          />
        ) : (
          <>
            {currentOutput && (
              <OutputCard content={currentOutput} label={t.taskChat.currentOutput} />
            )}

            {history.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg px-3 py-2.5 bg-boss-bg border border-boss-border">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-boss-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-boss-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-boss-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-[10px] text-boss-text-muted">
                      {thinkingText}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {showActions && (
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={handleDiscardLocal}
                  className="text-[10px] text-boss-text-muted hover:text-boss-text transition-colors"
                >
                  {t.taskChat.discard}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={handleApply}
                    className="px-3 py-1.5 rounded-lg border border-boss-border text-[10px] text-boss-text-muted hover:text-boss-text hover:border-boss-border-active transition-colors"
                  >
                    {t.taskChat.apply}
                  </button>
                  <button
                    onClick={handleApplyAndRerun}
                    className="px-3 py-1.5 rounded-lg bg-boss-accent hover:bg-boss-accent-hover text-white text-[10px] font-medium transition-colors"
                  >
                    {t.taskChat.applyAndRerun}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-lg bg-boss-error/10 border border-boss-error/20">
                <p className="text-[10px] text-boss-error">{error}</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-boss-border px-4 py-3 space-y-2">
        {!agent ? (
          <p className="text-[10px] text-boss-text-muted/50 text-center py-2">
            {t.taskChat.noAgent}
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  showEmptyState
                    ? t.taskChat.initialPlaceholder
                    : t.taskChat.followupPlaceholder
                }
                rows={2}
                disabled={loading}
                className="flex-1 px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-xs text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors resize-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!feedback.trim() || loading}
                className="self-end px-3 py-2 rounded-lg bg-boss-accent hover:bg-boss-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
              >
                {loading ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </div>

            <p className="text-[9px] text-boss-text-muted/40">
              {t.taskChat.keyboardHint}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function EmptyState({
  currentOutput,
  instruction,
  t,
}: {
  currentOutput: string | null;
  instruction: string;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="space-y-3">
      {currentOutput ? (
        <OutputCard content={currentOutput} label={t.taskChat.currentOutput} />
      ) : (
        <div className="p-4 rounded-lg bg-boss-bg border border-boss-border text-center">
          <p className="text-[11px] text-boss-text-muted mb-1">
            {t.taskChat.emptyTitle}
          </p>
          <p className="text-[10px] text-boss-text-muted/50">
            {t.taskChat.emptyHint}
          </p>
        </div>
      )}

      {currentOutput && (
        <div className="p-3 rounded-lg bg-boss-accent/5 border border-boss-accent/10">
          <p className="text-[10px] text-boss-text-muted leading-relaxed">
            {t.taskChat.guidance1}<br />
            {t.taskChat.guidance2.replace("{instruction}", `${instruction.slice(0, 30)}...`)}
            <br />
            {t.taskChat.example}
          </p>
        </div>
      )}
    </div>
  );
}

function OutputCard({
  content,
  label,
}: {
  content: string;
  label: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-boss-bg border border-boss-border">
      <p className="text-[9px] text-boss-text-muted/50 font-medium mb-2">
        {label}
      </p>
      <p className="text-[11px] text-boss-text-muted whitespace-pre-wrap leading-relaxed">
        {content}
      </p>
    </div>
  );
}

function MessageBubble({ message }: { message: RefinementMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2.5 ${
          isUser
            ? "bg-boss-accent/15 text-boss-text border border-boss-accent/20"
            : "bg-boss-bg text-boss-text-muted border border-boss-border"
        }`}
      >
        {isUser ? (
          <p className="text-[11px] whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="space-y-1.5">
            {message.changeSummary && (
              <p className="text-[9px] text-boss-accent font-medium">
                {message.changeSummary}
              </p>
            )}
            {message.outputSnapshot && (
              <p className="text-[11px] whitespace-pre-wrap leading-relaxed">
                {message.outputSnapshot}
              </p>
            )}
            {!message.outputSnapshot && (
              <p className="text-[11px] whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
