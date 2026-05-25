import { useState, useCallback } from "react";
import { getLLMConfig } from "@/services/llmService";

export interface ComfyModel { name: string; type: string; }

export function useComfyUIModels() {
  const [models, setModels] = useState<ComfyModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const cfg = getLLMConfig();
      const url = (cfg.comfyuiBaseUrl || "http://localhost:8188").replace(/\/$/, "");
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${url}/object_info`, { signal: controller.signal });
      clearTimeout(t);
      const data = await res.json();
      const found: ComfyModel[] = [];
      for (const [, info] of Object.entries(data)) {
        const required = (info as any)?.input?.required;
        if (!required) continue;
        for (const key of ["ckpt_name", "model_name", "checkpoint"]) {
          const arr = required[key];
          if (Array.isArray(arr) && Array.isArray(arr[0])) {
            for (const n of arr[0]) {
              if (typeof n === "string" && n.includes(".")) found.push({ name: n, type: "checkpoint" });
            }
          }
        }
      }
      const seen = new Set<string>();
      const unique = found.filter(m => { const k = m.name; if (seen.has(k)) return false; seen.add(k); return true; });
      setModels(unique);
      if (unique.length === 0) setError("No checkpoints found. Add models to ComfyUI models/checkpoints/");
    } catch (e: any) {
      setError("Cannot reach ComfyUI. Is it running?");
    } finally { setLoading(false); }
  }, []);

  return { models, loading, error, refresh };
}
