"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionRouter = void 0;
const express_1 = require("express");
const conversationEngine_1 = require("../engine/conversationEngine");
const sessionStore_1 = require("../store/sessionStore");
exports.sessionRouter = (0, express_1.Router)();
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
exports.sessionRouter.post("/start", async (_req, res, next) => {
    try {
        const { sessionId, firstMessage } = await (0, conversationEngine_1.startSession)();
        const body = {
            sessionId,
            message: firstMessage,
            status: "active",
        };
        res.status(200).json(body);
    }
    catch (err) {
        next(err);
    }
});
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
exports.sessionRouter.post("/:id/message", async (req, res, next) => {
    try {
        const sessionId = req.params.id;
        const body = req.body;
        if (!body.message || typeof body.message !== "string") {
            res
                .status(400)
                .json({ error: "Request body must include a 'message' string." });
            return;
        }
        if (!sessionStore_1.sessionStore.has(sessionId)) {
            res
                .status(404)
                .json({ error: `Session '${sessionId}' not found.` });
            return;
        }
        const { reply, status, planReady } = await (0, conversationEngine_1.processMessage)(sessionId, body.message.trim());
        const response = {
            message: reply,
            status: status,
            planReady,
        };
        res.status(200).json(response);
    }
    catch (err) {
        next(err);
    }
});
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
exports.sessionRouter.get("/:id/plan", (req, res, next) => {
    try {
        const sessionId = req.params.id;
        const session = sessionStore_1.sessionStore.get(sessionId);
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
        const response = { plan: session.plan };
        res.status(200).json(response);
    }
    catch (err) {
        next(err);
    }
});
