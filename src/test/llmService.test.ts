import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

// Mock fetch for Ollama and cloud calls
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("mock tauri response"),
}));

// Mock crypto for hash function used in mockResponse
vi.stubGlobal("crypto", {
  subtle: {
    digest: async (_algorithm: string, _data: Uint8Array) => {
      const mockHash = new Uint8Array(32).fill(0xab);
      return mockHash.buffer;
    },
  },
  randomUUID: () => "00000000-0000-0000-0000-000000000001",
  getRandomValues: <T extends Uint8Array>(arr: T): T => {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  },
} as any);

// Now import the module under test
import { llmService, configureLLM, getLLMConfig } from "@/services/llmService";
import type { AgentProfile } from "@/types/project";

// ─── Helpers ────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    agentId: overrides.agentId ?? "agent-test",
    name: overrides.name ?? "Test Agent",
    provider: overrides.provider ?? "local_ollama",
    modelName: overrides.modelName ?? "llama3:8b",
    systemPrompt: overrides.systemPrompt ?? "Be helpful.",
    temperature: overrides.temperature ?? 0.3,
    toolsAllowed: overrides.toolsAllowed ?? [],
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  llmService.setMode("mock");
});

// ─── Tests: Mock Mode ───────────────────────────────────────────

describe("llmService", () => {
  describe("mock mode", () => {
    it("returns a non-empty string for any prompt", async () => {
      const agent = makeAgent();
      const result = await llmService.call(agent, "Hello world");

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns agent name prefix in mock output", async () => {
      const agent = makeAgent({ name: "剧情分析师" });
      const result = await llmService.call(agent, "Analyze this");

      expect(result).toContain("剧情分析师");
    });

    it("detects goal validation prompt and returns JSON", async () => {
      const agent = makeAgent({ name: "Goal Validator" });
      const result = await llmService.call(
        agent,
        "Score how well the output meets the goal"
      );

      // Should be valid JSON
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("score");
      expect(parsed).toHaveProperty("passed");
      expect(parsed).toHaveProperty("summary");
      expect(parsed).toHaveProperty("notes");
      expect(typeof parsed.score).toBe("number");
      expect(parsed.score).toBeGreaterThanOrEqual(6);
      expect(parsed.score).toBeLessThanOrEqual(9);
    });

    it("returns image data URL when prompt contains image-related keywords", async () => {
      const agent = makeAgent();
      const result = await llmService.call(agent, "Generate a poster 海报 for the game");

      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it("returns CSV when prompt contains spreadsheet keywords", async () => {
      const agent = makeAgent();
      const result = await llmService.call(agent, "Output format: csv 表格");

      expect(result).toContain(",");
      // Should have header row
      expect(result.split("\n")[0]).toContain(",");
    });

    it("returns code when prompt contains code-related keywords", async () => {
      const agent = makeAgent();
      const result = await llmService.call(agent, "Generate a python script code program");

      expect(result).toContain("```python");
      expect(result).toContain("```");
    });

    it("returns markdown when prompt contains markdown keywords", async () => {
      const agent = makeAgent();
      const result = await llmService.call(agent, "Output format: markdown");

      expect(result).toContain("# ");
      expect(result).toContain("**");
    });

    it("is deterministic for the same agent name and prompt", async () => {
      const agent = makeAgent({ name: "StableBot" });
      const prompt = "repeatable test";

      const result1 = await llmService.call(agent, prompt);
      const result2 = await llmService.call(agent, prompt);

      expect(result1).toBe(result2);
    });

    it("produces different results for different agents", async () => {
      const agent1 = makeAgent({ name: "Agent Alpha" });
      const agent2 = makeAgent({ name: "Agent Beta" });

      const result1 = await llmService.call(agent1, "same prompt");
      const result2 = await llmService.call(agent2, "same prompt");

      expect(result1).not.toBe(result2);
    });

    it("simulates network delay", async () => {
      const agent = makeAgent();
      const start = Date.now();
      await llmService.call(agent, "test");
      const elapsed = Date.now() - start;

      // Mock mode has 800 + random(0-1200) ms delay
      expect(elapsed).toBeGreaterThanOrEqual(500); // allow for fast execution
    });
  });

  // ── Tests: Mode Management ────────────────────────────────────

  describe("mode management", () => {
    it("getMode returns current mode", () => {
      llmService.setMode("mock");
      expect(llmService.getMode()).toBe("mock");

      llmService.setMode("real");
      expect(llmService.getMode()).toBe("real");
    });
  });

  // ── Tests: Configuration ──────────────────────────────────────

  describe("configuration", () => {
    it("getLLMConfig returns default config initially", () => {
      const config = getLLMConfig();

      expect(config.mode).toBe("mock");
      expect(config.ollamaBaseUrl).toBe("http://localhost:11434");
      expect(config.comfyuiBaseUrl).toBe("http://localhost:8188");
      expect(config.customModels).toBeDefined();
    });

    it("configureLLM updates config partially", () => {
      configureLLM({ ollamaBaseUrl: "http://localhost:9999" });

      const config = getLLMConfig();
      expect(config.ollamaBaseUrl).toBe("http://localhost:9999");
      // Other defaults should be preserved
      expect(config.comfyuiBaseUrl).toBe("http://localhost:8188");
    });

    it("persists config to localStorage", () => {
      configureLLM({ openaiApiKey: "sk-test-key-123" });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "flowith_llm_config",
        expect.stringContaining("sk-test-key-123"),
      );
    });

    it("respects custom model configuration", () => {
      configureLLM({
        customModels: [
          {
            id: "cm-1",
            name: "DeepSeek V3",
            provider: "custom" as const,
            apiKey: "sk-ds-key",
            endpoint: "https://api.deepseek.com/v1",
            model: "deepseek-chat",
          },
        ],
      });

      const config = getLLMConfig();
      expect(config.customModels).toHaveLength(1);
      expect(config.customModels[0].name).toBe("DeepSeek V3");
    });
  });

  // ── Tests: Goal Validator Output ──────────────────────────────

  describe("goal validation mock", () => {
    it("returns passed:true when score >= 6", async () => {
      const agent = makeAgent({ name: "Goal Validator" });
      const prompt = "Score how well the output meets the goal";

      const result = await llmService.call(agent, prompt);
      const parsed = JSON.parse(result);

      expect(parsed.passed).toBe(true); // score 6-9 all pass
    });
  });
});
