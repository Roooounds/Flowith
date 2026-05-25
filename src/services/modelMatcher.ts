// ─── Model matching strategy ──────────────────────────────────────

interface OllamaModel {
  name: string;
  size: string;
}

/**
 * Score how well a model name matches a category/role.
 * Higher score = better match.
 */
function scoreModel(modelName: string, category: string): number {
  const lower = modelName.toLowerCase();
  let score = 0;

  // Size preference: prefer larger models for complex tasks
  if (lower.includes("70b") || lower.includes("72b")) score += 3;
  else if (lower.includes("14b") || lower.includes("32b")) score += 2;
  else if (lower.includes("8b") || lower.includes("7b")) score += 1;

  // Category-specific matching
  switch (category) {
    case "文案": case "Writing":
      if (lower.includes("qwen") || lower.includes("llama")) score += 5;
      if (lower.includes("mistral") || lower.includes("gemma")) score += 3;
      break;
    case "开发": case "Development":
      if (lower.includes("deepseek") || lower.includes("coder") || lower.includes("code")) score += 8;
      if (lower.includes("qwen") && lower.includes("coder")) score += 10;
      if (lower.includes("starcoder") || lower.includes("wizard")) score += 5;
      break;
    case "分析": case "Analysis":
      if (lower.includes("deepseek") && lower.includes("r1")) score += 10;
      if (lower.includes("qwen") && (lower.includes("14b") || lower.includes("32b") || lower.includes("72b"))) score += 6;
      if (lower.includes("llama") && (lower.includes("70b") || lower.includes("8b"))) score += 4;
      break;
    case "设计": case "Design":
      if (lower.includes("llama") || lower.includes("mistral")) score += 5;
      if (lower.includes("stable") || lower.includes("sdxl")) score += 10;
      break;
    case "产品": case "Product":
      if (lower.includes("qwen") || lower.includes("claude") || lower.includes("gpt")) score += 5;
      if (lower.includes("deepseek")) score += 4;
      break;
    case "审核": case "Review":
      if (lower.includes("deepseek") && lower.includes("r1")) score += 8;
      if (lower.includes("qwen") || lower.includes("llama")) score += 4;
      break;
    default:
      if (lower.includes("qwen") || lower.includes("llama")) score += 3;
  }

  // Penalize tiny models
  if (lower.includes("1b") || lower.includes("3b") || lower.includes("tiny")) score -= 2;

  // Prefer non-instruct variants slightly less
  if (lower.includes("instruct")) score -= 1;

  return score;
}

/**
 * Find the best matching local model for a given category.
 * Returns the model name or undefined if none found.
 */
export function matchModel(
  category: string | undefined,
  models: { name: string; size?: string }[],
): string | undefined {
  if (models.length === 0) return undefined;

  // Score all models
  const scored = models.map((m) => ({
    name: m.name,
    score: scoreModel(m.name, category ?? ""),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return the best match if score > 0
  return scored[0].score > 0 ? scored[0].name : scored[0].name;
}

/**
 * Get the recommended model hint text for a category.
 */
export function matchHint(category: string | undefined, matched: string | undefined): string {
  if (!matched) return "No local model found. Install one via Ollama.";
  return `Best match: ${matched}${category ? ` (for ${category})` : ""}`;
}
