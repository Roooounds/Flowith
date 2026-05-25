import { useState, useMemo } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import { PRESET_ROLES } from "@/data/presetRoles";
import RoleEditorModal from "@/components/common/RoleEditorModal";
import type { AgentProfile } from "@/types/project";

export default function AgentManagerPanel({ embedded, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const project = useProjectStore((s) => s.project);
  const addAgent = useProjectStore((s) => s.addAgent);
  const addPresetRoles = useProjectStore((s) => s.addPresetRoles);
  const removeAgent = useProjectStore((s) => s.removeAgent);
  const removeVaultAgent = useProjectStore((s) => s.removeVaultAgent);
  const removePresetPermanently = useProjectStore((s) => s.removePresetPermanently);
  const restoreVaultAgent = useProjectStore((s) => s.restoreVaultAgent);
  const setRightPanel = useProjectStore((s) => s.setRightPanel);
  const t = useT();

  const agents = project?.agents ?? [];
  const vaultAgents = project?.vaultAgents ?? [];
  const permanentlyDeleted = project?.permanentlyDeletedPresetNames ?? [];
  const [search, setSearch] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentProfile | null | "new">(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "preset" | "vault"; name: string; id?: string } | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      a.category?.toLowerCase().includes(q) ||
      a.modelName.toLowerCase().includes(q)
    );
  }, [agents, search]);

  const availablePresets = useMemo(() => {
    const addedNames = new Set(agents.map((a) => a.name));
    const vaultNames = new Set(vaultAgents.map((a) => a.name));
    const blockedNames = new Set([...permanentlyDeleted]);
    return PRESET_ROLES.filter((r) => !addedNames.has(r.name) && !vaultNames.has(r.name) && !blockedNames.has(r.name));
  }, [agents, vaultAgents, permanentlyDeleted]);

  const handleLoadPresets = () => {
    if (availablePresets.length === 0) return;
    addPresetRoles(availablePresets.map((r) => ({ ...r })));
    setShowPresets(false);
  };

  const loadCount = availablePresets.length + vaultAgents.length;

  return (
    <aside className={`${embedded ? "flex-1" : "w-80 shrink-0 border-l"} bg-boss-surface border-boss-border flex flex-col overflow-y-auto`}>
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-boss-border shrink-0">
          <h2 className="text-sm font-semibold text-boss-text">{t.agentManager.title}</h2>
          <button onClick={() => setRightPanel(null)} className="p-1 rounded hover:bg-boss-surface-hover text-boss-text-muted hover:text-boss-text transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 border-b border-boss-border shrink-0">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t.agentManager.searchPlaceholder}
          className="w-full px-3 py-1.5 bg-boss-bg border border-boss-border rounded-lg text-xs text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors" />
      </div>

      {/* New Role */}
      <div className="px-2 pt-2 shrink-0">
        <button onClick={() => setEditingAgent("new")}
          className="w-full py-1.5 rounded-lg border border-dashed border-boss-border hover:border-boss-accent text-[11px] text-boss-text-muted hover:text-boss-accent transition-colors">
          {t.agentManager.newAgent}
        </button>
      </div>

      {/* Role list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <p className="text-xs text-boss-text-muted text-center py-8">{t.agentManager.empty}</p>
        )}
        {filtered.map((agent) => (
          <div key={agent.agentId} onClick={() => setEditingAgent(agent)}
            className="p-2 rounded-lg border border-boss-border hover:border-boss-border-active hover:bg-boss-surface-hover cursor-pointer transition-colors group">
            <div className="flex items-start gap-2">
              {agent.avatarEmoji?.startsWith("data:") ? (
                <img src={agent.avatarEmoji} className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-boss-border" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-boss-bg border-2 border-boss-border flex items-center justify-center text-2xl shrink-0">
                  {agent.avatarEmoji || "👤"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-[11px] font-semibold text-boss-text truncate">{agent.name}</p>
                  {agent.category && <span className="text-[8px] px-1 py-px rounded bg-boss-accent/10 text-boss-accent shrink-0">{agent.category}</span>}
                </div>
                <p className="text-[9px] text-boss-text-muted/50 truncate mt-0.5">{agent.modelName || t.agentManager.noModel}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); removeAgent(agent.agentId); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-boss-error/20 text-boss-text-muted hover:text-boss-error transition-all shrink-0 mt-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Load Presets */}
      <div className="px-2 pb-2 shrink-0">
        <button onClick={() => setShowPresets(!showPresets)}
          className="w-full py-1.5 rounded-lg border border-dashed border-boss-border hover:border-boss-accent text-[11px] text-boss-text-muted hover:text-boss-accent transition-colors">
          {t.agentManager.loadPresets} {loadCount > 0 && `(${loadCount})`}
        </button>
      </div>

      {showPresets && (
        <div className="border-t border-boss-border max-h-64 overflow-y-auto shrink-0">
          {/* Presets header */}
          {availablePresets.length > 0 && (
            <>
              <div className="px-3 py-2 flex items-center justify-between sticky top-0 bg-boss-surface border-b border-boss-border">
                <span className="text-[10px] text-boss-text-muted">{t.agentManager.presetRoles} ({availablePresets.length})</span>
                <button onClick={handleLoadPresets}
                  className="px-2 py-0.5 rounded text-[10px] bg-boss-accent text-white hover:bg-boss-accent-hover transition-colors">{t.agentManager.addAll}</button>
              </div>
              <div className="p-2 space-y-1">
                {availablePresets.map((r, i) => (
                  <div key={`preset-${i}`}
                    className="flex items-center gap-2 p-2 rounded-lg border border-boss-border hover:border-boss-border-active transition-colors group">
                    <div className="flex-1 flex items-center gap-2 cursor-pointer" onClick={() => { addAgent({ ...r }); }}>
                      <span className="text-base shrink-0">{r.avatarEmoji}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-boss-text">{r.name}</p>
                        <span className="text-[9px] text-boss-text-muted">{r.category}</span>
                        <p className="text-[9px] text-boss-text-muted/60 leading-relaxed line-clamp-2 mt-0.5">{r.systemPrompt}</p>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "preset", name: r.name }); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-boss-error/20 text-boss-text-muted hover:text-boss-error transition-all shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Vault header */}
          {vaultAgents.length > 0 && (
            <>
              <div className="px-3 py-2 flex items-center justify-between sticky top-0 bg-boss-surface border-b border-boss-border">
                <span className="text-[10px] text-boss-text-muted/70">Vault ({vaultAgents.length})</span>
              </div>
              <div className="p-2 space-y-1">
                {vaultAgents.map((agent) => (
                  <div key={agent.agentId}
                    className="flex items-center gap-2 p-2 rounded-lg border border-boss-border border-dashed border-boss-text-muted/20 hover:border-boss-border-active transition-colors group">
                    <div className="flex-1 flex items-center gap-2 cursor-pointer" onClick={() => restoreVaultAgent(agent.agentId)}>
                      <span className="text-base shrink-0 opacity-50">{agent.avatarEmoji || "👤"}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-boss-text-muted/70">{agent.name}</p>
                        <span className="text-[9px] text-boss-text-muted/40">{agent.category || agent.modelName}</span>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "vault", name: agent.name, id: agent.agentId }); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-boss-error/20 text-boss-text-muted hover:text-boss-error transition-all shrink-0"
                      title="Permanently delete">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Empty state */}
          {loadCount === 0 && (
            <p className="text-[10px] text-boss-text-muted/50 text-center py-6">All presets have been added. Vault is empty.</p>
          )}
        </div>
      )}

      {/* Role editor modal */}
      {editingAgent !== null && (
        <RoleEditorModal
          agent={editingAgent === "new" ? null : editingAgent}
          onClose={() => setEditingAgent(null)}
        />
      )}

      {/* Confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="panel w-full max-w-xs p-5 space-y-4 shadow-2xl">
            <p className="text-sm text-boss-text text-center leading-relaxed">
              Permanently delete{" "}
              <span className="font-semibold text-boss-error">"{confirmDelete.name}"</span>?
              <br />
              <span className="text-[10px] text-boss-text-muted">This cannot be undone.</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-lg border border-boss-border text-xs text-boss-text-muted hover:text-boss-text transition-colors">
                {t.agentManager.cancel}
              </button>
              <button onClick={() => {
                if (confirmDelete.type === "preset") {
                  removePresetPermanently(confirmDelete.name);
                } else if (confirmDelete.type === "vault" && confirmDelete.id) {
                  removeVaultAgent(confirmDelete.id);
                }
                setConfirmDelete(null);
              }}
                className="flex-1 py-2 rounded-lg bg-boss-error hover:bg-boss-error/80 text-white text-xs font-medium transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
