import type { AgentProfile } from "@/types/project";
import {
  InsufficientVRAMError,
  ModelNotFoundError,
  APIKeyMissingError,
  APIKeyInvalidError,
  RateLimitedError,
  ProviderUnreachableError,
  ComfyUIUnreachableError,
  ComfyUIGenerationFailedError,
  ComfyUITimeoutError,
  FlowithAgentError,
  ErrorCode,
} from "@/types/errors";

// ─── Config ───────────────────────────────────────────────────────

export interface LLMServiceConfig {
  mode: "mock" | "real";
  ollamaBaseUrl: string;
  ollamaTimeoutMs: number;
  openaiApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  comfyuiBaseUrl: string;
  customModels: CustomModelConfig[];
}

export interface CustomModelConfig {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "gemini" | "custom";
  apiKey: string;
  endpoint?: string;
  model?: string;
}

const STORAGE_KEY = "flowith_llm_config";

function loadConfig(): LLMServiceConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Backwards compatibility: migrate old fields to customModels
      if (!parsed.customModels) parsed.customModels = [];
      if (parsed.customApiKey && !parsed.customModels.some((m: any) => m.apiKey === parsed.customApiKey)) {
        parsed.customModels.push({
          id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
          name: "Custom API",
          provider: "custom",
          apiKey: parsed.customApiKey,
          endpoint: parsed.customEndpoint || "https://api.deepseek.com/v1",
          model: parsed.customModel || "deepseek-chat",
        });
      }
      return { ...config, ...parsed };
    }
  } catch {}
  return { mode: "mock", ollamaBaseUrl: "http://localhost:11434", ollamaTimeoutMs: 120000, openaiApiKey: "", anthropicApiKey: "", geminiApiKey: "", comfyuiBaseUrl: "http://localhost:8188", customModels: [] };
}

async function saveConfigAsync() {
  if (!Array.isArray(config.customModels)) config.customModels = [];
  const json = JSON.stringify(config);
  localStorage.setItem(STORAGE_KEY, json);
  try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("write_settings", { json }); } catch {}
}

function defaultConfig(): LLMServiceConfig {
  return { mode: "real", ollamaBaseUrl: "http://localhost:11434", ollamaTimeoutMs: 120000, openaiApiKey: "", anthropicApiKey: "", geminiApiKey: "", comfyuiBaseUrl: "http://localhost:8188", customModels: [] };
}

let config: LLMServiceConfig = defaultConfig();
let configReady = false;

async function initConfig() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const json = await invoke<string>("read_settings");
    const parsed = JSON.parse(json);
    if (Object.keys(parsed).length > 0) {
      if (!parsed.customModels) parsed.customModels = [];
      config = { ...defaultConfig(), ...parsed };
      configReady = true;
      return;
    }
  } catch {}
  config = loadConfig();
  configReady = true;
}
initConfig();

export function configureLLM(partial: Partial<LLMServiceConfig>) {
  config = { ...config, ...partial };
  saveConfigAsync();
}

export function getLLMConfig(): LLMServiceConfig {
  return { ...config };
}

// ─── Mock responses ───────────────────────────────────────────────

function mockResponse(agentName: string, prompt: string): string {
  // Detect validation prompt and return JSON
  if (prompt.includes("Score how well the output meets the goal") || agentName === "Goal Validator") {
    const score = 6 + Math.floor(Math.random() * 4); // 6-9
    const passed = score >= 6;
    return JSON.stringify({
      score,
      passed,
      summary: passed
        ? "The output generally meets the project goal with minor gaps."
        : "The output partially meets the goal but has significant gaps.",
      notes: passed
        ? "Core themes are well-covered. Character design and plot structure align with the goal. Consider adding more specific chapter-level detail for Act 2 and 3."
        : "Key deliverables from the goal are not fully addressed. The output focuses on thematic analysis but lacks concrete chapter planning and character relationship mapping as specified in the goal.",
    });
  }

  // Simulate output format based on hints in the prompt
  if (/海报|poster|图片|image|生成图|promo|image format|output format.*image/i.test(prompt) && !/score|validat/i.test(prompt)) {
    // 200x150 visible placeholder image
    return "data:image/svg+xml;base64," + btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="#1a1d27"/>
        <text x="200" y="130" text-anchor="middle" fill="#6366f1" font-size="48" font-family="sans-serif">🖼️</text>
        <text x="200" y="180" text-anchor="middle" fill="#8b8fa3" font-size="14" font-family="sans-serif">AI Generated Image</text>
        <text x="200" y="200" text-anchor="middle" fill="#4a4f5e" font-size="11" font-family="sans-serif">Mock mode — placeholder</text>
      </svg>`
    );
  }
  if (/csv|spreadsheet|表格|excel format|output format.*csv/i.test(prompt) && !/score|validat/i.test(prompt)) {
    return "name,role,level,description\nKaelen,Former Knight,5,A fallen warrior seeking redemption\nMira,Shadow Spy,4,A mysterious agent playing both sides\nThe Warden,Ancient Guardian,7,An immortal protector of the realm";
  }
  if (/code|代码|python script|generate.*function|program|output format.*code/i.test(prompt) && !/score|validat/i.test(prompt)) {
    return "```python\n# Generated by Flowith\nfrom pptx import Presentation\n\nprs = Presentation()\nslide = prs.slides.add_slide(prs.slide_layouts[0])\nslide.shapes.title.text = \"Game Storyline Overview\"\nprs.save(\"output.pptx\")\n```";
  }
  if (/markdown|md format|output format.*markdown/i.test(prompt) && !/score|validat/i.test(prompt)) {
    return "# Game Storyline Analysis\n\n## Core Themes\n- **Sacrifice** - The cost of power\n- **Hope vs Despair** - Light in darkness\n\n## Characters\n| Name | Role | Arc |\n|------|------|-----|\n| Kaelen | Hero | Redemption |\n| Mira | Spy | Loyalty |";
  }

  const sampleOutputs = [
    `Based on the analysis, the core themes identified are: innovation, resilience, and transformation. The narrative can be structured around these pillars with clear character arcs that embody each theme.`,
    `The character analysis reveals three primary archetypes: the reluctant hero, the wise mentor, and the chaotic catalyst. Each character's motivation stems from their backstory, creating natural conflict and growth opportunities.`,
    `After reviewing the design document, I recommend a three-act structure with the following key beats: inciting incident at chapter 3, midpoint reversal at chapter 7, and climax at chapter 11.`,
    `The consistency check passed with minor notes: character A's motivation in chapter 4 slightly contradicts their established backstory. Recommend adjusting the dialogue to better align.`,
    `Chapter summaries are complete. Act 1 establishes the world and introduces the core cast. Each chapter ends with a hook that drives the reader forward. Total word count estimate: 45,000 words.`,
    `Final polish complete. Corrected 12 typos, improved 8 transition sentences, and ensured consistent naming conventions throughout. The document is now ready for publication.`,
  ];

  const idx = Math.abs(hashString(agentName + prompt)) % sampleOutputs.length;
  return `[${agentName}]: ${sampleOutputs[idx]}`;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ─── API Call ─────────────────────────────────────────────────────

async function callOllama(
  agent: AgentProfile,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const response = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: agent.modelName,
        prompt: `${agent.systemPrompt}\n\n${prompt}`,
        stream: false,
        options: { temperature: agent.temperature },
      }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      const lower = text.toLowerCase();
      if (lower.includes("out of memory") || lower.includes("cuda") || lower.includes("vram") || lower.includes("gpu memory")) {
        throw new InsufficientVRAMError(agent.modelName, text);
      }
      if (lower.includes("not found") || lower.includes("no such file") || response.status === 404) {
        throw new ModelNotFoundError(agent.modelName, text);
      }
      throw new FlowithAgentError(
        ErrorCode.UNKNOWN,
        `Ollama 错误 (${response.status}): ${text.slice(0, 200)}`,
        "检查 Ollama 服务状态后重试",
        "error",
        true,
        text,
      );
    }

    const data = await response.json();
    return data.response ?? JSON.stringify(data);
  } catch (err: any) {
    if (err instanceof FlowithAgentError) throw err;
    // AbortError: user cancelled — re-throw so execution loop stops
    if (err?.name === "AbortError") throw err;
    // Connection error
    if (err?.message?.includes("fetch") || err?.message?.includes("ECONNREFUSED") || err?.message?.includes("ENOTFOUND")) {
      throw new ProviderUnreachableError("Ollama", err.message);
    }
    throw err;
  }
}

async function callOpenAI(
  agent: AgentProfile,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: agent.modelName,
      messages: [
        { role: "system", content: agent.systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: agent.temperature,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401) throw new APIKeyInvalidError("OpenAI", text);
    if (response.status === 429) throw new RateLimitedError("OpenAI", text);
    if (response.status === 404) throw new ModelNotFoundError(agent.modelName, text);
    throw new FlowithAgentError(ErrorCode.UNKNOWN, `OpenAI 错误 (${response.status})`, "检查 API Key 和网络后重试", "error", true, text);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? JSON.stringify(data);
}

async function callAnthropic(
  agent: AgentProfile,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: agent.modelName,
      max_tokens: 4096,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      temperature: agent.temperature,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) throw new APIKeyInvalidError("Anthropic", text);
    if (response.status === 429) throw new RateLimitedError("Anthropic", text);
    throw new FlowithAgentError(ErrorCode.UNKNOWN, `Anthropic 错误 (${response.status})`, "检查 API Key 和网络后重试", "error", true, text);
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? JSON.stringify(data);
}

// ─── Cloud via Rust backend ────────────────────────────────────────

async function callCloudViaRust(
  provider: string,
  apiKey: string,
  agent: AgentProfile,
  prompt: string,
  endpoint?: string,
): Promise<string> {
  if (!apiKey) throw new APIKeyMissingError(provider);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("cloud_llm_call", {
      provider,
      apiKey,
      model: agent.modelName,
      systemPrompt: agent.systemPrompt || "",
      prompt,
      temperature: agent.temperature,
      endpoint: endpoint || "",
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg.includes("401") || msg.includes("403") || msg.includes("invalid") || msg.includes("Invalid")) {
      throw new APIKeyInvalidError(provider, msg);
    }
    if (msg.includes("429") || msg.includes("rate")) {
      throw new RateLimitedError(provider, msg);
    }
    if (msg.includes("fetch") || msg.includes("connection") || msg.includes("unreachable")) {
      throw new ProviderUnreachableError(provider, msg);
    }
    throw new FlowithAgentError(ErrorCode.UNKNOWN, `${provider} 调用失败`, msg.slice(0, 100), "error", true, msg);
  }
}

// ─── Custom Models ─────────────────────────────────────────────────

async function callCustomModel(
  agent: AgentProfile,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const customModel = config.customModels.find(m => m.name === agent.modelName);
  if (!customModel) throw new ModelNotFoundError(agent.modelName, `Custom model "${agent.modelName}" not found in settings.`);
  // Use the custom model's actual model name for the API call
  const apiModel = customModel.model || "gpt-3.5-turbo";
  const modifiedAgent = { ...agent, modelName: apiModel };
  return callCloudViaRust("custom", customModel.apiKey, modifiedAgent, prompt, customModel.endpoint || "https://api.deepseek.com");
}

// ─── ComfyUI (via Rust backend) ───────────────────────────────────

async function callComfyUI(agent: AgentProfile, prompt: string): Promise<string> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("comfyui_generate", {
      baseUrl: config.comfyuiBaseUrl,
      model: agent.modelName,
      prompt,
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg.includes("not reachable") || msg.includes("connection refused")) {
      throw new ComfyUIUnreachableError(config.comfyuiBaseUrl, msg);
    }
    if (msg.includes("timed out") || msg.includes("Timed out")) {
      throw new ComfyUITimeoutError(msg);
    }
    if (msg.includes("No prompt_id") || msg.includes("generation failed")) {
      throw new ComfyUIGenerationFailedError(msg, msg);
    }
    throw new ComfyUIGenerationFailedError(msg, msg);
  }
}

// ─── Public API ───────────────────────────────────────────────────

export const llmService = {
  async call(
    agent: AgentProfile,
    prompt: string,
    signal?: AbortSignal,
    nodeId?: string,
  ): Promise<string> {
    if (nodeId) {
      const { metrics, logger } = await import("./loggerService");
      metrics.recordLlmCall(nodeId);
      logger.info("llm", `LLM call: ${agent.name} (${agent.provider}/${agent.modelName})`, { nodeId, agentId: agent.agentId, provider: agent.provider, model: agent.modelName, promptLength: prompt.length });
    }
    if (config.mode === "mock") {
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
      if (signal?.aborted) throw new Error("AbortError");
      return mockResponse(agent.name, prompt);
    }

    switch (agent.provider) {
      case "local_ollama":
        return callOllama(agent, prompt, signal);
      case "cloud_openai":
        return callCloudViaRust("openai", config.openaiApiKey, agent, prompt);
      case "cloud_anthropic":
        return callCloudViaRust("anthropic", config.anthropicApiKey, agent, prompt);
      case "cloud_gemini":
        return callCloudViaRust("gemini", config.geminiApiKey, agent, prompt);
      case "cloud_custom":
        return callCustomModel(agent, prompt, signal);
      case "comfyui":
        return callComfyUI(agent, prompt);
      default:
        throw new Error(`Unknown provider: ${agent.provider}`);
    }
  },

  setMode(mode: "mock" | "real") {
    config.mode = mode;
  },

  getMode() {
    return config.mode;
  },
};
