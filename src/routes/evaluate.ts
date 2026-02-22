import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { evaluateSemantic } from "../engine/answerEvaluator";

export const evaluateRouter = Router();

/**
 * POST /api/evaluate
 *
 * Body: { submitted: string, expected: string }
 *
 * Returns: { correct: boolean }
 *
 * Asks Claude Haiku whether the submitted answer is semantically equivalent
 * to the expected answer. Used by the practice session to accept near-synonyms
 * and paraphrases as correct, not just exact string matches.
 */
evaluateRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    const { submitted, expected } = req.body as {
      submitted?: unknown;
      expected?: unknown;
    };

    if (typeof submitted !== "string" || typeof expected !== "string") {
      res.status(400).json({ error: "'submitted' and 'expected' must be strings." });
      return;
    }

    const s = submitted.trim();
    const e = expected.trim();

    if (!s || !e) {
      res.status(400).json({ error: "'submitted' and 'expected' must not be empty." });
      return;
    }

    try {
      const correct = await evaluateSemantic(s, e);
      res.json({ correct });
    } catch (err) {
      next(err);
    }
  }
);
