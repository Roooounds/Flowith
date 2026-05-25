/**
 * Python Backend Service — communicates with the FastAPI backend process.
 * The Rust side manages the subprocess lifecycle; this module handles HTTP calls.
 */

const BACKEND_URL = "http://127.0.0.1:8420";

export interface BackendStatus {
  status: "running" | "stopped" | "unhealthy";
  port: number;
  error?: string;
}

export interface AgentExecuteRequest {
  agent: {
    agent_id: string;
    name: string;
    provider: string;
    model_name: string;
    system_prompt: string;
    temperature: number;
    tools_allowed?: string[];
  };
  prompt: string;
  stream?: boolean;
}

export interface AgentExecuteResponse {
  output: string;
  success: boolean;
  via?: string;
}

export interface ToolAgentResponse {
  output: string;
  tool_calls: number;
  intermediate_steps: { tool: string; tool_input: string; observation: string }[];
  success: boolean;
  error?: string;
}

/**
 * Check Python backend health via Rust (to avoid CORS issues in Tauri WebView).
 * Falls back to direct HTTP if the Tauri command is not available.
 */
export async function getBackendStatus(): Promise<BackendStatus> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<string>("python_backend_status");
    return JSON.parse(raw);
  } catch {
    // Fallback: try direct HTTP
    try {
      const resp = await fetch(`${BACKEND_URL}/health`);
      if (resp.ok) {
        return { status: "running", port: 8420 };
      }
      return { status: "unhealthy", port: 8420 };
    } catch {
      return { status: "stopped", port: 8420 };
    }
  }
}

/**
 * Restart the Python backend via Rust command.
 */
export async function restartBackend(): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("python_backend_restart");
}

/**
 * Call the Python backend to execute a single agent.
 * Falls back to null if the backend is not available — caller should handle.
 */
export async function executeAgent(
  req: AgentExecuteRequest
): Promise<AgentExecuteResponse | null> {
  try {
    // Try Tauri command first (proxied through Rust → Python)
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<string>("cloud_llm_call", {
      provider: req.agent.provider,
      apiKey: "", // handled server-side from env
      model: req.agent.model_name,
      systemPrompt: req.agent.system_prompt,
      prompt: req.prompt,
      temperature: req.agent.temperature,
      endpoint: "",
    });
    return { output: raw, success: true };
  } catch {
    // Tauri command not available — try direct HTTP
    try {
      const resp = await fetch(`${BACKEND_URL}/agent/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: {
            ...req.agent,
            tools_allowed: req.agent.tools_allowed || [],
          },
          prompt: req.prompt,
        }),
      });
      if (resp.ok) {
        return await resp.json();
      }
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Execute an agent with tool-calling capability via the Python backend.
 * The agent can use web_search, code_execution, file_read, file_write tools.
 */
export async function executeToolAgent(
  req: AgentExecuteRequest & { max_iterations?: number }
): Promise<ToolAgentResponse | null> {
  try {
    const resp = await fetch(`${BACKEND_URL}/agent/execute/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: { ...req.agent, tools_allowed: req.agent.tools_allowed || [] },
        prompt: req.prompt,
        max_iterations: req.max_iterations ?? 10,
      }),
    });
    if (resp.ok) return await resp.json();
    return null;
  } catch {
    return null;
  }
}

/**
 * Get readiness info from the Python backend (Python version, platform, etc.)
 */
export async function getBackendInfo(): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(`${BACKEND_URL}/health/ready`);
    if (resp.ok) return await resp.json();
    return null;
  } catch {
    return null;
  }
}
