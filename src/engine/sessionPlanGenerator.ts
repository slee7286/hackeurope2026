import Anthropic from "@anthropic-ai/sdk";
import { sessionStore } from "../store/sessionStore";
import { PLAN_GENERATION_SYSTEM_PROMPT } from "./systemPrompts";
import type {
  FinalizeSessionArgs,
  TherapySessionPlan,
  TherapyBlock,
  TherapyItem,
  BlockType,
  Difficulty,
  PracticeQuestion,
  SessionSummary,
} from "../types";

// Initialised lazily so the key is read after dotenv has loaded.
let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// ─── Internal type for raw Claude JSON response ───────────────────────────────

interface RawPlanResponse {
  therapyBlocks: TherapyBlock[];
  estimatedDurationMinutes: number;
  /** CBT/reflective questions generated alongside the therapy blocks. */
  practiceQuestions?: PracticeQuestion[];
}

const MIN_PRACTICE_QUESTIONS = 4;
const MAX_PRACTICE_QUESTIONS = 50;
const DEFAULT_PRACTICE_QUESTIONS = 10;
const BLOCK_TYPES: BlockType[] = [
  "picture_description",
  "word_repetition",
  "sentence_completion",
  "word_finding",
];

interface PlanGenerationOptions {
  practiceQuestionCount?: number;
}

interface FlattenedTherapyItem {
  type: BlockType;
  topic: string;
  difficulty: Difficulty;
  description: string;
  item: TherapyItem;
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

function normalisePracticeQuestionCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PRACTICE_QUESTIONS;
  }
  const rounded = Math.trunc(value);
  return Math.min(MAX_PRACTICE_QUESTIONS, Math.max(MIN_PRACTICE_QUESTIONS, rounded));
}

function topicSeed(topic: string): string {
  const cleaned = topic.trim().split(/\s+/).filter(Boolean);
  if (cleaned.length === 0) return "word";
  return cleaned[0].toLowerCase();
}

function makeFallbackItem(type: BlockType, topic: string, index: number): TherapyItem {
  const seed = topicSeed(topic);
  switch (type) {
    case "picture_description":
      return {
        prompt: `Choose the image of ${seed}`,
        answer: seed,
        distractors: ["chair", "car", "tree"],
      };
    case "word_repetition":
      return { prompt: `Say this word: ${seed}`, answer: seed };
    case "sentence_completion":
      return { prompt: `Complete: I see a ___`, answer: seed };
    case "word_finding":
      return { prompt: `Name this item: ${seed}`, answer: seed };
    default:
      return { prompt: `Practice item ${index + 1}`, answer: seed };
  }
}

function flattenTherapyBlocks(blocks: TherapyBlock[]): FlattenedTherapyItem[] {
  const output: FlattenedTherapyItem[] = [];
  for (const block of blocks) {
    const type = BLOCK_TYPES.includes(block.type) ? block.type : null;
    if (!type) continue;
    for (const item of block.items ?? []) {
      output.push({
        type,
        topic: block.topic,
        difficulty: block.difficulty,
        description: block.description,
        item,
      });
    }
  }
  return output;
}

function buildTargetCounts(totalQuestions: number): Record<BlockType, number> {
  const counts: Record<BlockType, number> = {
    picture_description: 0,
    word_repetition: 0,
    sentence_completion: 0,
    word_finding: 0,
  };

  if (totalQuestions === 4) {
    for (const type of BLOCK_TYPES) counts[type] = 1;
    return counts;
  }

  const pictureCount = Math.floor(totalQuestions / 2) + 1;
  counts.picture_description = pictureCount;

  let remaining = totalQuestions - pictureCount;
  const otherTypes = BLOCK_TYPES.filter((type) => type !== "picture_description");
  let idx = 0;
  while (remaining > 0) {
    const type = otherTypes[idx % otherTypes.length];
    counts[type] += 1;
    remaining -= 1;
    idx += 1;
  }

  return counts;
}

function rebalanceTherapyBlocks(
  rawBlocks: TherapyBlock[],
  args: FinalizeSessionArgs,
  totalQuestions: number
): TherapyBlock[] {
  const flattened = flattenTherapyBlocks(rawBlocks);
  const byType: Record<BlockType, FlattenedTherapyItem[]> = {
    picture_description: [],
    word_repetition: [],
    sentence_completion: [],
    word_finding: [],
  };

  for (const row of flattened) {
    byType[row.type].push(row);
  }

  const targetCounts = buildTargetCounts(totalQuestions);
  const defaultTopics = args.interests.length > 0 ? args.interests : ["daily life"];
  const nextBlocks: TherapyBlock[] = [];
  let blockCounter = 1;

  for (const type of BLOCK_TYPES) {
    const target = targetCounts[type];
    if (target <= 0) continue;

    const sourceItems = byType[type];
    const items: TherapyItem[] = [];
    let blockTopic =
      sourceItems[0]?.topic ??
      defaultTopics[(blockCounter - 1) % defaultTopics.length] ??
      "daily life";
    let blockDifficulty: Difficulty = sourceItems[0]?.difficulty ?? args.difficulty;
    let blockDescription =
      sourceItems[0]?.description ?? `Practice ${type.replace(/_/g, " ")}`;

    for (let i = 0; i < target; i += 1) {
      const source = sourceItems.length > 0 ? sourceItems[i % sourceItems.length] : null;
      const topic = source?.topic ?? defaultTopics[i % defaultTopics.length] ?? blockTopic;
      if (i === 0) blockTopic = topic;
      const nextItem = source?.item ?? makeFallbackItem(type, topic, i);
      items.push({
        ...nextItem,
        distractors:
          type === "picture_description"
            ? (Array.isArray(nextItem.distractors) && nextItem.distractors.length > 0
              ? nextItem.distractors.slice(0, 3)
              : ["chair", "car", "tree"])
            : undefined,
      });
      if (source) {
        blockDifficulty = source.difficulty;
        blockDescription = source.description;
      }
    }

    nextBlocks.push({
      blockId: `block-${blockCounter}`,
      type,
      topic: blockTopic,
      difficulty: blockDifficulty,
      description: blockDescription,
      items,
    });
    blockCounter += 1;
  }

  return nextBlocks;
}

// ─── Session Summary Builder ──────────────────────────────────────────────────

/**
 * Constructs the richer SessionSummary from the enhanced finalize_session
 * tool arguments and the practice questions generated by Claude Haiku.
 *
 * All enhanced fields are optional — if Claude did not populate them during
 * the check-in, we fall back to sensible defaults derived from the core fields.
 */
function buildSessionSummary(
  args: FinalizeSessionArgs,
  practiceQuestions: PracticeQuestion[]
): SessionSummary {
  return {
    main_themes: args.main_themes ?? [args.mood, ...args.interests].slice(0, 3),
    emotional_tone: args.emotional_tone ?? [args.mood],
    scaling: {
      mood_rating: args.mood_rating ?? 5,
      stress_rating: args.stress_rating ?? 5,
    },
    // strengths_and_resources: not explicitly collected in the current check-in;
    // left as an empty array for future extension.
    strengths_and_resources: [],
    challenges: args.challenges ?? [],
    goals: args.goals ?? [],
    safety_concerns: {
      has_acute_risk: args.safety_concern ?? false,
      notes: args.safety_notes ?? "",
    },
    user_quotes: args.user_quotes ?? [],
    practice_questions: practiceQuestions,
  };
}

// ─── Main Generator ───────────────────────────────────────────────────────────

/**
 * Called after the finalize_session tool is triggered by the check-in agent.
 *
 * Makes a second Claude call (Haiku) to generate:
 *   1. therapyBlocks — structured speech therapy exercises (existing behaviour)
 *   2. practiceQuestions — CBT/reflective questions tailored to session themes (new)
 *
 * Assembles the full TherapySessionPlan — including the new SessionSummary —
 * and updates the sessionStore. The plan is then available via
 * GET /api/session/:id/plan.
 */
export async function generateSessionPlan(
  sessionId: string,
  args: FinalizeSessionArgs,
  options: PlanGenerationOptions = {}
): Promise<void> {
  const session = sessionStore.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found during plan generation`);
  }

  const practiceQuestionCount = normalisePracticeQuestionCount(
    options.practiceQuestionCount ?? session.practiceQuestionCount
  );
  const userPrompt = buildPlanPrompt(args, practiceQuestionCount);

  const response = await getClient().messages.create({
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

  // Normalise and validate practice questions
  const practiceQuestions: PracticeQuestion[] = (
    Array.isArray(parsed.practiceQuestions) ? parsed.practiceQuestions : []
  ).map((q, i) => ({
    question_id: q.question_id ?? `q-${i + 1}`,
    question_text: q.question_text ?? "",
    category: q.category ?? "reflection",
    related_theme: q.related_theme ?? (args.main_themes?.[0] ?? args.mood),
  }));

  const balancedTherapyBlocks = rebalanceTherapyBlocks(
    parsed.therapyBlocks,
    args,
    practiceQuestionCount
  );

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
    therapyBlocks: balancedTherapyBlocks.map((block, index) => ({
      ...block,
      // Guarantee blockId is always present even if Claude omits it
      blockId: block.blockId ?? `block-${index + 1}`,
    })),
    sessionSummary: buildSessionSummary(args, practiceQuestions),
  };

  session.plan = plan;
  session.status = "complete";
  sessionStore.set(sessionId, session);
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Constructs the user-turn prompt for the plan generation model.
 * Passes the full patient profile plus any richer check-in context so
 * the model can ground both therapy blocks and practice questions in
 * what was actually discussed during the session.
 */
function buildPlanPrompt(args: FinalizeSessionArgs, practiceQuestionCount: number): string {
  const lines: string[] = [
    "Patient profile:",
    `- Mood today: ${args.mood}`,
    `- Interests: ${args.interests.join(", ")}`,
    `- Chosen difficulty: ${args.difficulty}`,
    `- Clinical notes: ${args.notes}`,
    `- Target session duration: ${args.estimatedDurationMinutes} minutes`,
    `- Practice questions required: ${practiceQuestionCount}`,
  ];

  if (args.main_themes && args.main_themes.length > 0) {
    lines.push(`- Main themes from check-in: ${args.main_themes.join(", ")}`);
  }
  if (args.emotional_tone && args.emotional_tone.length > 0) {
    lines.push(`- Emotional tone: ${args.emotional_tone.join(", ")}`);
  }
  if (args.challenges && args.challenges.length > 0) {
    lines.push(`- Challenges mentioned: ${args.challenges.join(", ")}`);
  }
  if (args.goals && args.goals.length > 0) {
    lines.push(`- Goals expressed: ${args.goals.join(", ")}`);
  }

  lines.push(
    "",
    "Generate a therapy session plan for this patient.",
    "Use their interests as topics for therapy blocks.",
    "Match the difficulty level throughout.",
    `Generate exactly ${practiceQuestionCount} total therapy items across all therapyBlocks.`,
    "If total items are 4, create a balanced set with one item from each type: picture_description, word_repetition, sentence_completion, word_finding.",
    "If total items are greater than 4, picture_description must be the majority type (strictly more than half).",
    "Use any themes, challenges, or goals to inform the practice questions.",
    "Return valid JSON only."
  );

  return lines.join("\n");
}
