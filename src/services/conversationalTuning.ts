/**
 * Conversational Output Refinement Service.
 *
 * Enables the user to have a continuous dialogue with the Agent assigned
 * to a Task node, iterating on the node's output until satisfied.
 *
 * This service ONLY affects the current Task node's outputCache —
 * it does NOT modify the Agent Profile.
 */

import type { AgentProfile } from "@/types/project";
import { llmService } from "./llmService";

// ─── Types ────────────────────────────────────────────────────────

export interface RefinementMessage {
  role: "user" | "assistant";
  content: string;
  /** The full output after this round (only on assistant messages) */
  outputSnapshot?: string;
  /** One-line summary of what changed (only on assistant messages) */
  changeSummary?: string;
  timestamp: string;
}

export interface RefinementResult {
  /** The updated full output */
  output: string;
  /** One-line summary of what changed */
  changeSummary: string;
  /** The complete message history including this round */
  updatedHistory: RefinementMessage[];
}

// ─── Prompt Building ──────────────────────────────────────────────

const REFINEMENT_SYSTEM = `You are assisting a user in refining the output of an AI workflow node. Your job is to:

1. Review the CURRENT OUTPUT and the user's FEEDBACK.
2. Produce an UPDATED version of the output that addresses the feedback.
3. Explain BRIEFLY what you changed.

CRITICAL RULES:
- Return the COMPLETE output, not just the changed parts. The downstream nodes need full data.
- Preserve the structure and format of the original output unless the user asks to change it.
- If the user's feedback is vague, ask clarifying questions instead of guessing.
- Keep your change summary to ONE sentence.

Reply in this EXACT format (use the marker exactly as shown):

---CHANGE_SUMMARY---
<one sentence describing what changed>
---OUTPUT---
<the complete updated output>`;

function buildRefinementPrompt(
  instruction: string,
  currentOutput: string,
  history: RefinementMessage[],
  newFeedback: string,
): string {
  const parts: string[] = [];

  parts.push(`ORIGINAL TASK INSTRUCTION:\n${instruction}`);

  if (history.length === 0) {
    // First refinement round — no prior conversation
    parts.push(`\nCURRENT OUTPUT:\n${currentOutput || "(no output yet)"}`);
    parts.push(`\nUSER FEEDBACK:\n${newFeedback}`);
    parts.push(`\nProvide the updated output in the format specified above.`);
  } else {
    // Has prior conversation — include history
    parts.push(`\nCURRENT OUTPUT:\n${currentOutput || "(no output yet)"}`);
    parts.push(`\nCONVERSATION HISTORY:`);
    for (const msg of history) {
      const label = msg.role === "user" ? "User" : "Assistant";
      parts.push(`\n${label}: ${msg.content}`);
    }
    parts.push(`\nLATEST USER FEEDBACK:\n${newFeedback}`);
    parts.push(`\nProvide the updated output in the format specified above.`);
  }

  return parts.join("\n");
}

function parseRefinementResponse(raw: string): { output: string; changeSummary: string } {
  const summaryMarker = "---CHANGE_SUMMARY---";
  const outputMarker = "---OUTPUT---";

  const summaryStart = raw.indexOf(summaryMarker);
  const outputStart = raw.indexOf(outputMarker);

  let changeSummary = "Updated based on your feedback.";
  let output = raw;

  if (summaryStart !== -1 && outputStart !== -1) {
    changeSummary = raw
      .slice(summaryStart + summaryMarker.length, outputStart)
      .trim();
    output = raw.slice(outputStart + outputMarker.length).trim();
  } else if (summaryStart !== -1) {
    // Has summary but no output marker — everything after summary is output
    changeSummary = raw
      .slice(summaryStart + summaryMarker.length)
      .split("\n")[0]
      .trim();
  }

  // Clean up
  if (!output || output.length < 5) {
    output = raw; // fallback: use entire response
  }

  return { output, changeSummary };
}

// ─── Main API ─────────────────────────────────────────────────────

export async function refineOutput(
  agent: AgentProfile,
  instruction: string,
  currentOutput: string,
  history: RefinementMessage[],
  newFeedback: string,
  signal?: AbortSignal,
): Promise<RefinementResult> {
  const prompt = buildRefinementPrompt(
    instruction,
    currentOutput,
    history,
    newFeedback,
  );

  // Use the refinement system prompt as the agent's system prompt
  // so the LLM understands the task format
  const raw = await llmService.call(
    {
      ...agent,
      systemPrompt: REFINEMENT_SYSTEM,
    },
    prompt,
    signal,
  );

  const { output, changeSummary } = parseRefinementResponse(raw);

  const now = new Date().toISOString();
  const userMsg: RefinementMessage = {
    role: "user",
    content: newFeedback,
    timestamp: now,
  };
  const assistantMsg: RefinementMessage = {
    role: "assistant",
    content: changeSummary,
    outputSnapshot: output,
    changeSummary,
    timestamp: now,
  };

  return {
    output,
    changeSummary,
    updatedHistory: [...history, userMsg, assistantMsg],
  };
}
