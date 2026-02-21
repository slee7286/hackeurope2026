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
 * Claude calls this tool when it has collected enough information.
 * The typed arguments become the PatientProfile for plan generation.
 * The `required` array forces Claude to gather all fields before triggering.
 */
const FINALIZE_SESSION_TOOL: Tool = {
  name: "finalize_session",
  description:
    "Call this when you have learned the patient's mood, at least one interest, and difficulty preference. This ends the check-in and generates the therapy plan.",
  input_schema: {
    type: "object" as const,
    properties: {
      mood: {
        type: "string",
        enum: ["happy", "tired", "anxious", "motivated", "frustrated", "calm"],
        description: "The patient's current mood.",
      },
      interests: {
        type: "array",
        items: { type: "string" },
        description:
          "Topics the patient enjoys. Examples: family, cooking, sports, music, nature, travel.",
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
          "Short clinical observations. Example: 'responds well to yes/no questions, prefers short prompts'.",
      },
      estimatedDurationMinutes: {
        type: "number",
        description: "Suggested session length in minutes. Use 15, 20, or 25.",
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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
 * Uses a synthetic first user message because Anthropic requires the
 * conversation to start with a user turn.
 */
export async function startSession(): Promise<{
  sessionId: string;
  firstMessage: string;
}> {
  const sessionId = uuidv4();

  const bootstrapMessages: MessageParam[] = [
    { role: "user", content: "Hello, I am ready to start." },
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
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

// ─── Process User Message ─────────────────────────────────────────────────────

/**
 * Appends user message to history, calls Claude, handles tool use,
 * and returns Claude's text reply plus updated session status.
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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 500,
    system: CHECK_IN_SYSTEM_PROMPT,
    tools: [FINALIZE_SESSION_TOOL],
    messages,
  });

  const toolUse = extractToolUse(response.content);

  if (toolUse) {
    // Claude decided to finalize — extract args and trigger plan generation
    const args = toolUse.input as FinalizeSessionArgs;

    const closingMessage =
      extractText(response.content) ||
      "Thank you! I am preparing your session now. One moment.";

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

  // Normal conversation turn
  const replyText = extractText(response.content);
  session.history.push({ role: "assistant", content: replyText });
  sessionStore.set(sessionId, session);

  return {
    reply: replyText,
    status: "active",
    planReady: false,
  };
}
