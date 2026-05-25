import { useState, useEffect, useCallback } from "react";
import { useProjectStore } from "@/stores/projectStore";
import {
  addDocument,
  searchKb,
  getDocuments,
  deleteDocument,
} from "@/services/kbService";
import type { KbDoc, KbSearchResult } from "@/services/kbService";
import { useT } from "@/i18n/context";

interface Props {
  insideModal?: boolean;
  onClose?: () => void;
}

export default function KnowledgeBasePanel({ insideModal, onClose }: Props) {
  const t = useT();
  const projectId = useProjectStore((s) => s.activeProjectId);
  const project = useProjectStore((s) => s.project);
  const setRightPanel = useProjectStore((s) => s.setRightPanel);

  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KbSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Add document form
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const loadDocs = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await getDocuments(projectId);
      setDocs(result);
    } catch {
      // KB may not be available (Ollama not running, etc.)
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleSearch = async () => {
    if (!projectId || !searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    setError("");
    try {
      const results = await searchKb(projectId, searchQuery.trim(), 10);
      setSearchResults(results);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    setSearching(false);
  };

  const handleAdd = async () => {
    if (!projectId || !newTitle.trim() || !newContent.trim()) return;
    setAdding(true);
    setError("");
    try {
      await addDocument(projectId, newTitle.trim(), newContent.trim());
      setNewTitle("");
      setNewContent("");
      setShowAdd(false);
      await loadDocs();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    setAdding(false);
  };

  const handleDelete = async (docId: string) => {
    try {
      await deleteDocument(docId);
      await loadDocs();
      // Also clear search results if this doc was in them
      if (searchResults) {
        setSearchResults(searchResults.filter((r) => r.doc_id !== docId));
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") insideModal ? onClose?.() : setRightPanel(null);
  };

  return (
    <aside className={insideModal ? "flex flex-col h-full bg-boss-surface" : "w-80 shrink-0 bg-boss-surface border-l border-boss-border flex flex-col h-full"}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-boss-border shrink-0">
        <h2 className="text-sm font-semibold text-boss-text">
          📚 {project?.knowledgeBaseId ? t.kb?.title || "Knowledge Base" : (t.kb?.title || "Knowledge Base")}
        </h2>
        <button
          onClick={() => insideModal ? onClose?.() : setRightPanel(null)}
          className="text-boss-text-muted hover:text-boss-text text-lg leading-none px-1"
        >
          ×
        </button>
      </div>

      {/* Search bar */}
      <div className="px-4 py-3 border-b border-boss-border shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchResults(null); }}
            onKeyDown={handleKeyDown}
            placeholder={t.kb?.searchPlaceholder || "Search knowledge base..."}
            className="flex-1 px-3 py-1.5 text-xs rounded-md bg-boss-bg border border-boss-border text-boss-text placeholder-boss-text-muted focus:outline-none focus:border-boss-accent"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-boss-accent text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {searching ? "..." : t.kb?.search || "Search"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-400/10 border-b border-red-400/20 shrink-0">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Add document button */}
      <div className="px-4 py-2 border-b border-boss-border shrink-0">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="w-full px-3 py-1.5 text-xs font-medium rounded-md border border-boss-border text-boss-text-muted hover:text-boss-text hover:border-boss-accent transition-colors"
        >
          {showAdd ? (t.kb?.cancelAdd || "Cancel") : (t.kb?.addDocument || "+ Add Document")}
        </button>
      </div>

      {/* Add document form */}
      {showAdd && (
        <div className="px-4 py-3 border-b border-boss-border shrink-0 space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t.kb?.titlePlaceholder || "Document title..."}
            className="w-full px-3 py-1.5 text-xs rounded-md bg-boss-bg border border-boss-border text-boss-text placeholder-boss-text-muted focus:outline-none focus:border-boss-accent"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={t.kb?.contentPlaceholder || "Paste document content here...\n\nThis will be converted to an embedding vector for semantic search."}
            rows={5}
            className="w-full px-3 py-1.5 text-xs rounded-md bg-boss-bg border border-boss-border text-boss-text placeholder-boss-text-muted focus:outline-none focus:border-boss-accent resize-none"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newTitle.trim() || !newContent.trim()}
            className="w-full px-3 py-1.5 text-xs font-medium rounded-md bg-boss-accent text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {adding ? (t.kb?.adding || "Adding...") : (t.kb?.save || "Save to Knowledge Base")}
          </button>
        </div>
      )}

      {/* Search results */}
      {searchResults && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2 text-xs text-boss-text-muted border-b border-boss-border">
            {searchResults.length === 0
              ? (t.kb?.noResults || "No results found")
              : `${searchResults.length} ${t.kb?.results || "results"}`}
          </div>
          {searchResults.map((r) => (
            <div key={r.doc_id} className="px-4 py-3 border-b border-boss-border hover:bg-boss-surface-hover">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-boss-text truncate">{r.title}</div>
                  <div className="text-[11px] text-boss-accent mt-0.5">
                    {(r.score * 100).toFixed(0)}% match
                  </div>
                  <div className="text-[11px] text-boss-text-muted mt-1 line-clamp-3 whitespace-pre-wrap">
                    {r.content}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(r.doc_id)}
                  className="text-boss-text-muted hover:text-red-400 text-xs shrink-0"
                  title={t.kb?.delete || "Delete"}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document list (when not searching) */}
      {!searchResults && (
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-xs text-boss-text-muted">
              {t.kb?.loading || "Loading..."}
            </div>
          ) : docs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-boss-text-muted">
              {t.kb?.empty || "No documents yet. Add your first document above."}
              <br />
              <span className="text-[10px] mt-1 block">
                {t.kb?.emptyHint || "Documents are embedded for semantic search."}
              </span>
            </div>
          ) : (
            docs.map((doc) => (
              <div key={doc.doc_id} className="px-4 py-3 border-b border-boss-border hover:bg-boss-surface-hover">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-boss-text truncate">{doc.title}</div>
                    <div className="text-[10px] text-boss-text-muted mt-0.5">
                      {doc.created_at?.slice(0, 10)} · {doc.content.length} chars
                    </div>
                    <div className="text-[11px] text-boss-text-muted mt-1 line-clamp-2 whitespace-pre-wrap">
                      {doc.content.slice(0, 200)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.doc_id)}
                    className="text-boss-text-muted hover:text-red-400 text-xs shrink-0"
                    title={t.kb?.delete || "Delete"}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
