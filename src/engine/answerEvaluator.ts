import Anthropic from "@anthropic-ai/sdk";

// ─── Anthropic Client ─────────────────────────────────────────────────────────
// Lazy singleton — reads the key at call time, after dotenv has run.

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// ─── Semantic Answer Evaluator ────────────────────────────────────────────────

/**
 * Asks Claude Haiku whether `submitted` is semantically equivalent to
 * `expected`. Returns true when Claude responds with "correct".
 *
 * The model is instructed to be generous with synonyms and paraphrases
 * and to reply with only the word "correct" or "incorrect", making it
 * trivial to parse reliably.
 *
 * Throws on network/API error so the caller can fall back to exact matching.
 */
export async function evaluateSemantic(
  submitted: string,
  expected: string
): Promise<boolean> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    // 10 tokens is more than enough for "correct" or "incorrect"
    max_tokens: 10,
    system:
      'You are a grading assistant for a speech therapy app. ' +
      'Decide if the student answer has the same essential meaning as the reference answer. ' +
      'Be generous with synonyms, paraphrases, and partial matches. ' +
      'Respond with only the single word "correct" or "incorrect".',
    messages: [
      {
        role: "user",
        content: `Reference answer: ${expected}\nStudent answer: ${submitted}`,
      },
    ],
  });

  const text =
    response.content.find((b) => b.type === "text")?.text?.trim().toLowerCase() ?? "";

  // Accept "correct" — reject anything else (including unexpected output)
  return text.startsWith("correct");
}
