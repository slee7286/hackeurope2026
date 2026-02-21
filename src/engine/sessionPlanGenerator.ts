import Anthropic from "@anthropic-ai/sdk";
import { sessionStore } from "../store/sessionStore";
import { PLAN_GENERATION_SYSTEM_PROMPT } from "./systemPrompts";
import type {
  FinalizeSessionArgs,
  TherapySessionPlan,
  TherapyBlock,
  Difficulty,
} from "../types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const DEFAULT_PLAN_DIFFICULTY: Difficulty = "medium";

// ─── Internal type for raw Claude JSON response ───────────────────────────────

interface RawPlanResponse {
  therapyBlocks: TherapyBlock[];
  estimatedDurationMinutes: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the first JSON object from a string, stripping any markdown
 * code fences that the model may have added despite instructions.
 */
function extractJson(text: string): string {
  // Strip ```json ... ``` or ``` ... ``` fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();
  // Fall back to the first { ... } block in the string
  const start = text.indexOf("{");
  if (start !== -1) return text.slice(start);
  return text.trim();
}

// ─── Main Generator ───────────────────────────────────────────────────────────

/**
 * Called after finalize_session tool is triggered.
 * Makes a second Claude call (Haiku) to generate structured therapy blocks.
 * Updates sessionStore directly when complete.
 */
export async function generateSessionPlan(
  sessionId: string,
  args: FinalizeSessionArgs
): Promise<void> {
  const session = sessionStore.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found during plan generation`);
  }

  const userPrompt = buildPlanPrompt(args);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: PLAN_GENERATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText =
    response.content.find((b) => b.type === "text")?.text ?? "";

  // Strip markdown code fences that models sometimes add despite instructions
  const jsonText = extractJson(rawText);

  let parsed: RawPlanResponse;
  try {
    parsed = JSON.parse(jsonText) as RawPlanResponse;
  } catch {
    throw new Error(
      `Plan generator returned invalid JSON. Raw output: ${rawText.slice(0, 400)}`
    );
  }

  if (!Array.isArray(parsed.therapyBlocks) || parsed.therapyBlocks.length === 0) {
    throw new Error("Plan generator returned empty therapyBlocks array");
  }

  const plan: TherapySessionPlan = {
    patientProfile: {
      mood: args.mood,
      interests: args.interests,
      difficulty: DEFAULT_PLAN_DIFFICULTY,
      notes: args.notes,
    },
    sessionMetadata: {
      sessionId,
      createdAt: session.createdAt,
      estimatedDurationMinutes:
        parsed.estimatedDurationMinutes ?? args.estimatedDurationMinutes,
    },
    therapyBlocks: parsed.therapyBlocks.map((block, index) => ({
      ...block,
      // Guarantee blockId is always present even if Claude omits it
      blockId: block.blockId ?? `block-${index + 1}`,
    })),
  };

  session.plan = plan;
  session.status = "complete";
  sessionStore.set(sessionId, session);
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildPlanPrompt(args: FinalizeSessionArgs): string {
  return `
Patient profile:
- Mood today: ${args.mood}
- Interests: ${args.interests.join(", ")}
- Clinical notes: ${args.notes}
- Target session duration: ${args.estimatedDurationMinutes} minutes

Generate a therapy session plan for this patient.
Use their interests as topics.
Use medium-level tasks throughout.
Set every block "difficulty" to "medium".
Return valid JSON only.
`.trim();
}
