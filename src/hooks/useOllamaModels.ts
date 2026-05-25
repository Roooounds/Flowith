import { useState, useEffect, useCallback } from "react";
import { getLLMConfig } from "@/services/llmService";

interface OllamaModel {
  name: string;
  size: string;
  modified_at: string;
}

export function useOllamaModels() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    const cfg = getLLMConfig();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${cfg.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: OllamaModel[] = (data.models ?? []).map((m: any) => ({
        name: m.name ?? m.model ?? "",
        size: formatSize(m.size ?? 0),
        modified_at: m.modified_at ?? "",
      }));
      setModels(list);
    } catch (e: any) {
      setError(e?.message ?? "Failed to connect to Ollama");
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  return { models, loading, error, refresh: fetchModels };
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}
