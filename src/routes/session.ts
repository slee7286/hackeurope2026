import { Router, Request, Response, NextFunction } from "express";
import {
  startSession,
  processMessage,
  startDemoSkipSession,
} from "../engine/conversationEngine";
import { sessionStore } from "../store/sessionStore";
import type {
  StartSessionResponse,
  SendMessageRequest,
  SendMessageResponse,
  GetPlanResponse,
  SessionStatus,
} from "../types";

export const sessionRouter = Router();

const MIN_PRACTICE_QUESTIONS = 4;
const MAX_PRACTICE_QUESTIONS = 50;

function parsePracticeQuestionCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const next = Math.trunc(value);
  return Math.min(MAX_PRACTICE_QUESTIONS, Math.max(MIN_PRACTICE_QUESTIONS, next));
}

// ─── POST /api/session/start ──────────────────────────────────────────────────
/**
 * Creates a new check-in session.
 * Returns the sessionId and Claude's opening greeting message.
 *
 * No request body required.
 *
 * Response 200:
 *   { "sessionId": "uuid", "message": "Hello! ...", "status": "active" }
 */
sessionRouter.post(
  "/start",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const requestBody = (_req.body ?? {}) as { practiceQuestionCount?: number };
      const practiceQuestionCount = parsePracticeQuestionCount(requestBody.practiceQuestionCount);
      const { sessionId, firstMessage } = await startSession({ practiceQuestionCount });

      const responseBody: StartSessionResponse = {
        sessionId,
        message: firstMessage,
        status: "active",
      };

      res.status(200).json(responseBody);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/session/demo-skip ─────────────────────────────────────────────
/**
 * Creates a demo session and skips counselling by auto-filling the required
 * profile inputs for plan generation.
 *
 * Response 200:
 *   { "sessionId": "uuid", "message": "...", "status": "finalizing" }
 */
sessionRouter.post(
  "/demo-skip",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const requestBody = (_req.body ?? {}) as { practiceQuestionCount?: number };
      const practiceQuestionCount = parsePracticeQuestionCount(requestBody.practiceQuestionCount);
      const { sessionId, firstMessage, status } = await startDemoSkipSession({ practiceQuestionCount });

      const responseBody: StartSessionResponse = {
        sessionId,
        message: firstMessage,
        status,
      };

      res.status(200).json(responseBody);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/session/:id/message ───────────────────────────────────────────
/**
 * Sends a patient message and returns Claude's reply.
 *
 * Request body: { "message": "I feel tired" }
 *
 * Response 200:
 *   { "message": "...", "status": "active"|"finalizing"|"complete", "planReady": false }
 *
 * When status becomes "finalizing", the client should start polling GET /:id/plan.
 */
sessionRouter.post(
  "/:id/message",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.id;
      const body = req.body as SendMessageRequest;

      if (!body.message || typeof body.message !== "string") {
        res
          .status(400)
          .json({ error: "Request body must include a 'message' string." });
        return;
      }

      if (!sessionStore.has(sessionId)) {
        res
          .status(404)
          .json({ error: `Session '${sessionId}' not found.` });
        return;
      }

      const { reply, status, planReady } = await processMessage(
        sessionId,
        body.message.trim()
      );

      const response: SendMessageResponse = {
        message: reply,
        status: status as SessionStatus,
        planReady,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/session/:id/plan ────────────────────────────────────────────────
/**
 * Returns the generated TherapySessionPlan once ready.
 * Poll this endpoint after receiving status "finalizing".
 *
 * Response 200 (ready):   { "plan": { ... } }
 * Response 202 (pending): { "message": "...", "status": "finalizing" }
 * Response 404:           Session not found
 * Response 500:           Plan generation failed
 */
sessionRouter.get(
  "/:id/plan",
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.id;
      const session = sessionStore.get(sessionId);

      if (!session) {
        res
          .status(404)
          .json({ error: `Session '${sessionId}' not found.` });
        return;
      }

      if (session.status === "error") {
        res.status(500).json({
          error: "Plan generation failed.",
          detail: session.error,
        });
        return;
      }

      if (session.status !== "complete" || !session.plan) {
        res.status(202).json({
          message: "Plan is being generated. Please try again shortly.",
          status: session.status,
        });
        return;
      }

      const response: GetPlanResponse = { plan: session.plan };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
);
