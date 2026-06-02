/**
 * Flowith 分层错误类型体系。
 * 每个错误携带：错误码、用户可读消息、修复建议、严重程度、是否可恢复。
 */

// ─── Severity ────────────────────────────────────────────────────

export type ErrorSeverity = "warning" | "error" | "critical";

// ─── Error Codes ─────────────────────────────────────────────────

export const ErrorCode = {
  // Local model errors
  VRAM_OVERFLOW: "VRAM_OVERFLOW",
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  MODEL_LOADING: "MODEL_LOADING",
  MODEL_TIMEOUT: "MODEL_TIMEOUT",

  // Cloud provider errors
  API_KEY_MISSING: "API_KEY_MISSING",
  API_KEY_INVALID: "API_KEY_INVALID",
  PROVIDER_UNREACHABLE: "PROVIDER_UNREACHABLE",
  RATE_LIMITED: "RATE_LIMITED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",

  // ComfyUI errors
  COMFYUI_UNREACHABLE: "COMFYUI_UNREACHABLE",
  COMFYUI_GENERATION_FAILED: "COMFYUI_GENERATION_FAILED",
  COMFYUI_TIMEOUT: "COMFYUI_TIMEOUT",
  COMFYUI_MODEL_MISSING: "COMFYUI_MODEL_MISSING",

  // Generic
  INVALID_RESPONSE: "INVALID_RESPONSE",
  ABORTED: "ABORTED",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ─── Structured Error ────────────────────────────────────────────

export interface StructuredError {
  errorCode: ErrorCodeType;
  message: string;
  suggestion: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  rawMessage?: string;
}

// ─── Base Class ──────────────────────────────────────────────────

export class FlowithAgentError extends Error {
  public readonly errorCode: ErrorCodeType;
  public readonly suggestion: string;
  public readonly severity: ErrorSeverity;
  public readonly recoverable: boolean;
  public readonly rawMessage?: string;

  constructor(
    errorCode: ErrorCodeType,
    message: string,
    suggestion: string,
    severity: ErrorSeverity = "error",
    recoverable: boolean = true,
    rawMessage?: string,
  ) {
    super(message);
    this.name = "FlowithAgentError";
    this.errorCode = errorCode;
    this.suggestion = suggestion;
    this.severity = severity;
    this.recoverable = recoverable;
    this.rawMessage = rawMessage;
  }

  toStructuredError(): StructuredError {
    return {
      errorCode: this.errorCode,
      message: this.message,
      suggestion: this.suggestion,
      severity: this.severity,
      recoverable: this.recoverable,
      rawMessage: this.rawMessage,
    };
  }
}

// ─── Local Model Errors ──────────────────────────────────────────

export class InsufficientVRAMError extends FlowithAgentError {
  constructor(modelName: string, rawMessage?: string) {
    super(
      ErrorCode.VRAM_OVERFLOW,
      `VRAM 不足，无法加载模型 "${modelName}"`,
      "建议：1) 关闭其他占用显存的程序 2) 换用更小的模型（如 7B/8B 参数） 3) 降低上下文窗口大小",
      "critical",
      false,
      rawMessage,
    );
    this.name = "InsufficientVRAMError";
  }
}

export class ModelNotFoundError extends FlowithAgentError {
  constructor(modelName: string, rawMessage?: string) {
    super(
      ErrorCode.MODEL_NOT_FOUND,
      `本地模型 "${modelName}" 未安装`,
      `建议：运行 \`ollama pull ${modelName}\` 下载模型，或在设置中切换到已安装的模型`,
      "error",
      false,
      rawMessage,
    );
    this.name = "ModelNotFoundError";
  }
}

export class ModelTimeoutError extends FlowithAgentError {
  constructor(modelName: string, rawMessage?: string) {
    super(
      ErrorCode.MODEL_TIMEOUT,
      `模型 "${modelName}" 响应超时（30秒）`,
      "建议：1) 检查 Ollama 是否正在运行 2) 模型是否首次加载（首次加载较慢）3) 重试一次",
      "error",
      true,
      rawMessage,
    );
    this.name = "ModelTimeoutError";
  }
}

// ─── Cloud Provider Errors ───────────────────────────────────────

export class APIKeyMissingError extends FlowithAgentError {
  constructor(providerName: string, rawMessage?: string) {
    super(
      ErrorCode.API_KEY_MISSING,
      `${providerName} API Key 未配置`,
      `建议：在设置面板中填入 ${providerName} 的 API Key`,
      "error",
      false,
      rawMessage,
    );
    this.name = "APIKeyMissingError";
  }
}

export class APIKeyInvalidError extends FlowithAgentError {
  constructor(providerName: string, rawMessage?: string) {
    super(
      ErrorCode.API_KEY_INVALID,
      `${providerName} API Key 无效或已过期`,
      `建议：检查 Key 是否正确，或在 ${providerName} 后台生成新 Key`,
      "critical",
      false,
      rawMessage,
    );
    this.name = "APIKeyInvalidError";
  }
}

export class RateLimitedError extends FlowithAgentError {
  constructor(providerName: string, rawMessage?: string) {
    super(
      ErrorCode.RATE_LIMITED,
      `${providerName} 请求频率超限`,
      `建议：等待 30-60 秒后重试，或升级 API 套餐`,
      "warning",
      true,
      rawMessage,
    );
    this.name = "RateLimitedError";
  }
}

export class ProviderUnreachableError extends FlowithAgentError {
  constructor(providerName: string, rawMessage?: string) {
    super(
      ErrorCode.PROVIDER_UNREACHABLE,
      `无法连接 ${providerName}`,
      "建议：检查网络连接和防火墙设置",
      "error",
      true,
      rawMessage,
    );
    this.name = "ProviderUnreachableError";
  }
}

// ─── ComfyUI Errors ──────────────────────────────────────────────

export class ComfyUIUnreachableError extends FlowithAgentError {
  constructor(baseUrl: string, rawMessage?: string) {
    super(
      ErrorCode.COMFYUI_UNREACHABLE,
      `无法连接 ComfyUI 服务 (${baseUrl})`,
      "建议：确认 ComfyUI 已启动并启用了 API 模式（--enable-cors-header）",
      "error",
      true,
      rawMessage,
    );
    this.name = "ComfyUIUnreachableError";
  }
}

export class ComfyUIGenerationFailedError extends FlowithAgentError {
  constructor(detail: string, rawMessage?: string) {
    super(
      ErrorCode.COMFYUI_GENERATION_FAILED,
      `ComfyUI 图像生成失败：${detail}`,
      "建议：检查 workflow 参数和模型文件是否完整",
      "error",
      true,
      rawMessage,
    );
    this.name = "ComfyUIGenerationFailedError";
  }
}

export class ComfyUITimeoutError extends FlowithAgentError {
  constructor(rawMessage?: string) {
    super(
      ErrorCode.COMFYUI_TIMEOUT,
      "ComfyUI 图像生成超时 — 可能需要几分钟",
      "建议：1) 降低分辨率或采样步数 2) 检查 GPU 是否被其他任务占用",
      "error",
      true,
      rawMessage,
    );
    this.name = "ComfyUITimeoutError";
  }
}

// ─── Factory: Parse raw error into typed error ───────────────────

/**
 * 从原始 fetch/API 错误文本中识别错误类型并返回对应的 FlowithAgentError。
 */
export function classifyError(
  provider: string,
  modelName: string,
  statusCode: number,
  responseBody: string,
): FlowithAgentError {
  const lower = responseBody.toLowerCase();

  // --- Ollama-specific patterns ---
  if (provider === "local_ollama" || provider === "ollama") {
    if (
      lower.includes("out of memory") ||
      lower.includes("cuda out of memory") ||
      lower.includes("insufficient vram") ||
      lower.includes("not enough gpu memory")
    ) {
      return new InsufficientVRAMError(modelName, responseBody);
    }
    if (
      lower.includes("model not found") ||
      lower.includes("model '") && lower.includes("not found") ||
      lower.includes("no such file")
    ) {
      return new ModelNotFoundError(modelName, responseBody);
    }
    if (statusCode === 404) {
      return new ModelNotFoundError(modelName, responseBody);
    }
  }

  // --- OpenAI-specific ---
  if (provider === "openai" || provider === "cloud_openai") {
    if (statusCode === 401) {
      return new APIKeyInvalidError("OpenAI", responseBody);
    }
    if (statusCode === 429) {
      if (lower.includes("quota")) return new RateLimitedError("OpenAI", responseBody);
      return new RateLimitedError("OpenAI", responseBody);
    }
    if (statusCode === 404 && lower.includes("model")) {
      return new ModelNotFoundError(modelName, responseBody);
    }
  }

  // --- Anthropic-specific ---
  if (provider === "anthropic" || provider === "cloud_anthropic") {
    if (statusCode === 401 || (statusCode === 403 && lower.includes("invalid"))) {
      return new APIKeyInvalidError("Anthropic", responseBody);
    }
    if (statusCode === 429) {
      return new RateLimitedError("Anthropic", responseBody);
    }
  }

  // --- Gemini-specific ---
  if (provider === "gemini" || provider === "cloud_gemini") {
    if (statusCode === 403 || (statusCode === 400 && lower.includes("api key"))) {
      return new APIKeyInvalidError("Gemini", responseBody);
    }
    if (statusCode === 429) {
      return new RateLimitedError("Gemini", responseBody);
    }
  }

  // --- ComfyUI ---
  if (provider === "comfyui") {
    if (lower.includes("timed out") || lower.includes("generation timed out")) {
      return new ComfyUITimeoutError(responseBody);
    }
    if (lower.includes("connection refused") || lower.includes("not reachable")) {
      return new ComfyUIUnreachableError("ComfyUI", responseBody);
    }
  }

  // --- Status code heuristics ---
  if (statusCode === 401 || statusCode === 403) {
    return new APIKeyInvalidError(provider, responseBody);
  }
  if (statusCode === 429) {
    return new RateLimitedError(provider, responseBody);
  }

  // --- Fallback ---
  return new FlowithAgentError(
    ErrorCode.UNKNOWN,
    `${provider} 返回错误 (${statusCode}): ${responseBody.slice(0, 200)}`,
    "检查服务状态后重试",
    "error",
    true,
    responseBody,
  );
}

/**
 * 从网络错误（fetch rejected）中识别连接类错误。
 */
export function classifyConnectionError(
  provider: string,
  errorMessage: string,
): FlowithAgentError {
  const lower = errorMessage.toLowerCase();

  if (provider === "comfyui") {
    if (lower.includes("connection refused") || lower.includes("not reachable")) {
      return new ComfyUIUnreachableError("ComfyUI", errorMessage);
    }
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("network error") ||
    lower.includes("connection refused") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound")
  ) {
    if (provider === "local_ollama") {
      return new ProviderUnreachableError(
        "Ollama",
        "无法连接本地 Ollama 服务。确认 http://localhost:11434 可访问。",
      );
    }
    return new ProviderUnreachableError(provider, errorMessage);
  }

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return new ModelTimeoutError("unknown", errorMessage);
  }

  return new FlowithAgentError(
    ErrorCode.UNKNOWN,
    errorMessage.slice(0, 200),
    "检查网络和服务状态后重试",
    "error",
    true,
    errorMessage,
  );
}
