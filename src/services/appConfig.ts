/**
 * App-level configuration — execution, cache, and appearance settings
 * stored separately from LLM service credentials.
 */

export type ThemeMode = "dark" | "light" | "system";

export interface FlowithAppConfig {
  // Execution
  executionTimeoutMs: number; // per-node timeout, 30s–300s
  maxRetries: number; // 0–5
  maxConcurrency: number; // 1–8, parallel branch limit
  softTimeout: boolean; // show warning but keep waiting

  // Cache
  cacheEnabled: boolean;

  // Theme
  theme: ThemeMode;
}

const STORAGE_KEY = "flowith_app_config";

function defaults(): FlowithAppConfig {
  return {
    executionTimeoutMs: 120_000,
    maxRetries: 1,
    maxConcurrency: 3,
    softTimeout: true,
    cacheEnabled: true,
    theme: "dark",
  };
}

let cfg: FlowithAppConfig = defaults();

function load(): FlowithAppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaults(), ...parsed };
    }
  } catch { /* ignore */ }
  return defaults();
}

// Init on import
cfg = load();

export function getAppConfig(): FlowithAppConfig {
  return { ...cfg };
}

export function updateAppConfig(partial: Partial<FlowithAppConfig>): void {
  cfg = { ...cfg, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/** Apply the current theme class to <html>. Call once on app mount. */
export function applyAppTheme(): void {
  const { theme } = cfg;
  const root = document.documentElement;
  root.classList.remove("theme-dark", "theme-light");

  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.add(prefersDark ? "theme-dark" : "theme-light");
  } else {
    root.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
  }
}
