import { Router, Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  startSession,
  processMessage,
  startDemoSkipSession,
} from "../engine/conversationEngine";
import { sessionStore } from "../store/sessionStore";
import { practiceSummaryStore } from "../store/practiceSummaryStore";
import type {
  Difficulty,
  StartSessionResponse,
  SendMessageRequest,
  SendMessageResponse,
  GetPlanResponse,
  SessionStatus,
  CreatePracticeSessionSummaryRequest,
  CreatePracticeSessionSummaryResponse,
  GetPracticeSessionHistoryResponse,
  PracticeSessionSummary,
} from "../types";

export const sessionRouter = Router();

const DEFAULT_PATIENT_ID = "P-12345";
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;
const MIN_PRACTICE_QUESTIONS = 4;
const MAX_PRACTICE_QUESTIONS = 50;

function parsePracticeQuestionCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const next = Math.trunc(value);
  return Math.min(MAX_PRACTICE_QUESTIONS, Math.max(MIN_PRACTICE_QUESTIONS, next));
}

function toTopicList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function buildPracticeSummaryFields(input: {
  correct: number;
  total: number;
  blockCount: number;
  difficulty: Difficulty;
  estimatedDurationMinutes: number;
  topics: string[];
}): Pick<PracticeSessionSummary, "summary" | "performance" | "metrics"> {
  const safeTotal = Math.max(0, Math.round(input.total));
  const safeCorrect = Math.min(Math.max(0, Math.round(input.correct)), safeTotal);
  const safeBlockCount = Math.max(1, Math.round(input.blockCount));
  const safeDuration = Math.max(1, Math.round(input.estimatedDurationMinutes));
  const accuracyPercent =
    safeTotal > 0 ? Math.round((safeCorrect / safeTotal) * 100) : 0;

  const topics = input.topics.length > 0 ? input.topics : ["general practice"];
  const topicPhrase = topics.slice(0, 3).join(", ");
  const exerciseLabel = safeBlockCount === 1 ? "exercise" : "exercises";

  const summary =
    `Completed ${safeTotal} prompts across ${safeBlockCount} ${exerciseLabel} ` +
    `focused on ${topicPhrase}.`;
  const performance =
    `${accuracyPercent}% accuracy (${safeCorrect}/${safeTotal}) ` +
    `at ${input.difficulty} difficulty in a ${safeDuration}-minute plan.`;

  return {
    summary,
    performance,
    metrics: {
      correct: safeCorrect,
      total: safeTotal,
      accuracyPercent,
      blockCount: safeBlockCount,
      difficulty: input.difficulty,
      estimatedDurationMinutes: safeDuration,
      topics,
    },
  };
}

sessionRouter.post(
  "/start",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestBody = (req.body ?? {}) as { practiceQuestionCount?: number };
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

sessionRouter.post(
  "/demo-skip",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestBody = (req.body ?? {}) as { practiceQuestionCount?: number };
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

sessionRouter.post(
  "/:id/practice-summary",
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.id;
      const session = sessionStore.get(sessionId);

      if (!session) {
        res.status(404).json({ error: `Session '${sessionId}' not found.` });
        return;
      }

      if (!session.plan) {
        res.status(409).json({
          error:
            "Session plan not ready. Save summary after plan generation completes.",
        });
        return;
      }

      const existing = practiceSummaryStore.getBySessionId(sessionId);
      if (existing) {
        const existingResponse: CreatePracticeSessionSummaryResponse = {
          summary: existing,
        };
        res.status(200).json(existingResponse);
        return;
      }

      const body = req.body as CreatePracticeSessionSummaryRequest;
      const metrics = body?.metrics;

      if (!metrics || typeof metrics !== "object") {
        res.status(400).json({ error: "Request body must include 'metrics'." });
        return;
      }

      const correct = Number(metrics.correct);
      const total = Number(metrics.total);
      const blockCount = Number(metrics.blockCount);
      const estimatedDurationMinutes = Number(metrics.estimatedDurationMinutes);

      if (
        !Number.isFinite(correct) ||
        !Number.isFinite(total) ||
        !Number.isFinite(blockCount) ||
        !Number.isFinite(estimatedDurationMinutes) ||
        correct < 0 ||
        total < 0 ||
        blockCount <= 0 ||
        estimatedDurationMinutes <= 0
      ) {
        res.status(400).json({
          error:
            "Metrics values must be non-negative numbers (blockCount and estimatedDurationMinutes must be greater than zero).",
        });
        return;
      }

      if (!isDifficulty(metrics.difficulty)) {
        res.status(400).json({
          error: "metrics.difficulty must be one of: easy, medium, hard.",
        });
        return;
      }

      const patientId =
        typeof body.patientId === "string" && body.patientId.trim()
          ? body.patientId.trim()
          : DEFAULT_PATIENT_ID;
      const completedAtCandidate =
        typeof body.completedAt === "string" ? body.completedAt : "";
      const completedAtDate = completedAtCandidate
        ? new Date(completedAtCandidate)
        : new Date();

      if (Number.isNaN(completedAtDate.getTime())) {
        res.status(400).json({
          error: "completedAt must be a valid ISO timestamp when provided.",
        });
        return;
      }

      const summaryFields = buildPracticeSummaryFields({
        correct,
        total,
        blockCount,
        difficulty: metrics.difficulty,
        estimatedDurationMinutes,
        topics: toTopicList(metrics.topics),
      });

      const summary: PracticeSessionSummary = {
        id: uuidv4(),
        sessionId,
        patientId,
        completedAt: completedAtDate.toISOString(),
        summary: summaryFields.summary,
        performance: summaryFields.performance,
        metrics: summaryFields.metrics,
      };

      practiceSummaryStore.save(summary);

      const response: CreatePracticeSessionSummaryResponse = { summary };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }
);

sessionRouter.get("/history", (req: Request, res: Response, next: NextFunction) => {
  try {
    const patientIdRaw =
      typeof req.query.patientId === "string" ? req.query.patientId.trim() : "";
    const patientId = patientIdRaw || DEFAULT_PATIENT_ID;

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.round(limitRaw)))
      : DEFAULT_HISTORY_LIMIT;

    const items = practiceSummaryStore.listByPatientId(patientId, limit);
    const response: GetPracticeSessionHistoryResponse = { items };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

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
