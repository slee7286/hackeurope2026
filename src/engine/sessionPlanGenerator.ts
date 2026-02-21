import Anthropic from "@anthropic-ai/sdk";
import { sessionStore } from "../store/sessionStore";
import { PLAN_GENERATION_SYSTEM_PROMPT } from "./systemPrompts";
import type {
  FinalizeSessionArgs,
  TherapySessionPlan,
  TherapyBlock,
} from "../types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Internal type for raw Claude JSON response ───────────────────────────────

interface RawPlanResponse {
  therapyBlocks: TherapyBlock[];
  estimatedDurationMinutes: number;
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
    model: "claude-3-haiku-20240307",
    max_tokens: 2048,
    system: PLAN_GENERATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText =
    response.content.find((b) => b.type === "text")?.text ?? "";

  let parsed: RawPlanResponse;
  try {
    parsed = JSON.parse(rawText) as RawPlanResponse;
  } catch {
    throw new Error(
      `Plan generator returned invalid JSON. Raw output: ${rawText.slice(0, 300)}`
    );
  }

  if (!Array.isArray(parsed.therapyBlocks) || parsed.therapyBlocks.length === 0) {
    throw new Error("Plan generator returned empty therapyBlocks array");
  }

  const plan: TherapySessionPlan = {
    patientProfile: {
      mood: args.mood,
      interests: args.interests,
      difficulty: args.difficulty,
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
- Chosen difficulty: ${args.difficulty}
- Clinical notes: ${args.notes}
- Target session duration: ${args.estimatedDurationMinutes} minutes

Generate a therapy session plan for this patient.
Use their interests as topics.
Match the difficulty level throughout.
Return valid JSON only.
`.trim();
}
