import Anthropic from "@anthropic-ai/sdk";
import type {
  Tool,
  MessageParam,
  ContentBlock,
  ToolUseBlock,
  TextBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { v4 as uuidv4 } from "uuid";
import { sessionStore } from "../store/sessionStore";
import { CHECK_IN_SYSTEM_PROMPT } from "./systemPrompts";
import { generateSessionPlan } from "./sessionPlanGenerator";
import type { ConversationMessage, FinalizeSessionArgs, SessionState } from "../types";

// ─── Tool Definition ──────────────────────────────────────────────────────────

/**
 * Claude calls this tool when the check-in is complete and it has collected
 * enough information to generate the therapy plan.
 *
 * Core fields (required):
 *   mood, interests, difficulty, notes, estimatedDurationMinutes
 *
 * Enhanced fields (optional):
 *   Populated when the richer 5-phase check-in gathers deeper context.
 *   Used to build SessionSummary alongside the therapy blocks.
 */
const FINALIZE_SESSION_TOOL: Tool = {
  name: "finalize_session",
  description:
    "Call this when you have gathered the patient's mood, at least one interest, and difficulty preference. This ends the check-in and triggers therapy plan generation.",
  input_schema: {
    type: "object" as const,
    properties: {

      // ── Core fields ─────────────────────────────────────────────────────────

      mood: {
        type: "string",
        enum: ["happy", "tired", "anxious", "motivated", "frustrated", "calm"],
        description: "The patient's current mood, closest enum match.",
      },
      interests: {
        type: "array",
        items: { type: "string" },
        description:
          "Topics the patient enjoys or mentioned. Examples: family, cooking, sports, music, nature, travel.",
        minItems: 1,
      },
      difficulty: {
        type: "string",
        enum: ["easy", "medium", "hard"],
        description: "The practice difficulty the patient chose.",
      },
      notes: {
        type: "string",
        description:
          "1–2 brief clinical observations. Example: 'responds well to yes/no questions; prefers short prompts'.",
      },
      estimatedDurationMinutes: {
        type: "number",
        description: "Suggested session length in minutes. Use 15 (easy), 20 (medium), or 25 (hard).",
      },

      // ── Enhanced check-in fields ─────────────────────────────────────────────

      main_themes: {
        type: "array",
        items: { type: "string" },
        description:
          "1–3 key topics that emerged during the check-in. Examples: ['fatigue', 'family connection', 'difficulty sleeping'].",
      },
      emotional_tone: {
        type: "array",
        items: { type: "string" },
        description:
          "Emotions the patient expressed during the check-in. Examples: ['tired', 'hopeful', 'a little anxious'].",
      },
      mood_rating: {
        type: "number",
        description:
          "Mood score on a 1–10 scale (1 = very low, 10 = excellent). Use the number from any scale asked, or estimate from context.",
      },
      stress_rating: {
        type: "number",
        description:
          "Estimated stress level on a 1–10 scale (1 = none, 10 = overwhelming). Based on tone and content of the conversation.",
      },
      challenges: {
        type: "array",
        items: { type: "string" },
        description:
          "Specific difficulties the patient mentioned. Examples: ['difficulty sleeping', 'feeling isolated', 'pain when speaking'].",
      },
      goals: {
        type: "array",
        items: { type: "string" },
        description:
          "Any next steps or wishes the patient expressed. Examples: ['speak more clearly at meals', 'try a short walk'].",
      },
      safety_concern: {
        type: "boolean",
        description:
          "Set to true if the patient expressed hopelessness, self-harm ideation, or acute distress. Otherwise false.",
      },
      safety_notes: {
        type: "string",
        description:
          "A brief note describing the safety concern if safety_concern is true. Empty string otherwise.",
      },
      user_quotes: {
        type: "array",
        items: { type: "string" },
        description:
          "Up to 3 short direct quotes from the patient that capture their experience. Examples: ['I just feel so tired lately', 'I want to speak more clearly'].",
      },
    },
    required: [
      "mood",
      "interests",
      "difficulty",
      "notes",
      "estimatedDurationMinutes",
    ],
  },
};

// ─── Anthropic Client ─────────────────────────────────────────────────────────
//
// Initialised lazily so the key is read after dotenv has loaded,
// not at module-import time (which happens before dotenv runs).

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const DEMO_FINALIZE_ARGS: FinalizeSessionArgs = {
  mood: "motivated",
  interests: ["travel", "family", "music"],
  difficulty: "easy",
  notes:
    "Demo mode auto-generated check-in profile to skip counselling and move directly into practice.",
  estimatedDurationMinutes: 15,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toAnthropicMessages(history: ConversationMessage[]): MessageParam[] {
  return history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

function extractText(content: ContentBlock[]): string {
  const textBlock = content.find((b): b is TextBlock => b.type === "text");
  return textBlock?.text ?? "";
}

function extractToolUse(content: ContentBlock[]): ToolUseBlock | null {
  const toolBlock = content.find(
    (b): b is ToolUseBlock =>
      b.type === "tool_use" && b.name === "finalize_session"
  );
  return toolBlock ?? null;
}

// ─── Start Session ────────────────────────────────────────────────────────────

/**
 * Creates a new session and generates Claude's opening greeting.
 *
 * Uses a synthetic first user message because Anthropic requires the
 * conversation to start with a user turn.
 *
 * The opening greeting follows Phase 1 of the check-in: a warm, varied
 * welcome that immediately asks how the patient has been feeling and offers
 * 3–4 clear mood choices.
 */
export async function startSession(): Promise<{
  sessionId: string;
  firstMessage: string;
}> {
  const sessionId = uuidv4();

  const bootstrapMessages: MessageParam[] = [
    { role: "user", content: "Hello, I am ready to start." },
  ];

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5",
    // 400 tokens gives Claude room for a warm, varied opener with choices
    max_tokens: 400,
    system: CHECK_IN_SYSTEM_PROMPT,
    tools: [FINALIZE_SESSION_TOOL],
    messages: bootstrapMessages,
  });

  const firstMessage = extractText(response.content);

  const session: SessionState = {
    sessionId,
    createdAt: new Date().toISOString(),
    status: "active",
    history: [
      { role: "user", content: "Hello, I am ready to start." },
      { role: "assistant", content: firstMessage },
    ],
    plan: null,
    error: null,
  };

  sessionStore.set(sessionId, session);
  return { sessionId, firstMessage };
}

/**
 * Creates a new demo session that bypasses counselling and immediately
 * starts plan generation with safe default profile values.
 */
export async function startDemoSkipSession(): Promise<{
  sessionId: string;
  firstMessage: string;
  status: "finalizing";
}> {
  const sessionId = uuidv4();
  const firstMessage =
    "Demo Skip enabled. Skipping counselling and preparing your practice now.";

  const session: SessionState = {
    sessionId,
    createdAt: new Date().toISOString(),
    status: "finalizing",
    history: [{ role: "assistant", content: firstMessage }],
    plan: null,
    error: null,
  };

  sessionStore.set(sessionId, session);

  generateSessionPlan(sessionId, DEMO_FINALIZE_ARGS).catch((err: Error) => {
    const s = sessionStore.get(sessionId);
    if (s) {
      s.status = "error";
      s.error = err.message;
      sessionStore.set(sessionId, s);
    }
  });

  return { sessionId, firstMessage, status: "finalizing" };
}

// ─── Process User Message ─────────────────────────────────────────────────────

/**
 * Appends the user's message to history, calls Claude with the full
 * conversation context, handles tool use (finalize_session), and returns
 * Claude's text reply plus updated session status.
 *
 * When finalize_session is triggered, plan generation fires asynchronously
 * so the HTTP response can return immediately. The client polls
 * GET /api/session/:id/plan until status is "complete".
 */
export async function processMessage(
  sessionId: string,
  userMessage: string
): Promise<{ reply: string; status: string; planReady: boolean }> {
  const session = sessionStore.get(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.status !== "active") {
    return {
      reply:
        session.status === "complete"
          ? "Your session plan is ready. Please continue to the exercises."
          : "Please wait. Preparing your session...",
      status: session.status,
      planReady: session.status === "complete",
    };
  }

  session.history.push({ role: "user", content: userMessage });

  const messages = toAnthropicMessages(session.history);

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5",
    // 600 tokens: room for reflective listening + question + choices
    max_tokens: 600,
    system: CHECK_IN_SYSTEM_PROMPT,
    tools: [FINALIZE_SESSION_TOOL],
    messages,
  });

  const toolUse = extractToolUse(response.content);

  if (toolUse) {
    // ── Finalize path ──────────────────────────────────────────────────────
    // Claude decided the check-in is complete. Extract the structured args,
    // write a compassionate closing message, then trigger async plan generation.

    const args = toolUse.input as FinalizeSessionArgs;

    const closingMessage =
      extractText(response.content) ||
      "Thank you for sharing with me today. I'm preparing your session now — just a moment.";

    session.history.push({ role: "assistant", content: closingMessage });
    session.status = "finalizing";
    sessionStore.set(sessionId, session);

    // Fire plan generation without await — HTTP response returns immediately.
    // Client polls GET /api/session/:id/plan until status is "complete".
    generateSessionPlan(sessionId, args).catch((err: Error) => {
      const s = sessionStore.get(sessionId);
      if (s) {
        s.status = "error";
        s.error = err.message;
        sessionStore.set(sessionId, s);
      }
    });

    return {
      reply: closingMessage,
      status: "finalizing",
      planReady: false,
    };
  }

  // ── Normal conversation turn ───────────────────────────────────────────────
  const replyText = extractText(response.content);
  session.history.push({ role: "assistant", content: replyText });
  sessionStore.set(sessionId, session);

  return {
    reply: replyText,
    status: "active",
    planReady: false,
  };
}
