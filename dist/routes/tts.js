"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ttsRouter = void 0;
const express_1 = require("express");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
exports.ttsRouter = (0, express_1.Router)();
/**
 * GET /api/tts/voices
 * Returns accent/dialect voice metadata from TTS/elevenlabs_monolingual_v1_accents_dialects.json.
 */
exports.ttsRouter.get("/voices", async (_req, res, next) => {
    try {
        const accentsFilePath = path_1.default.join(process.cwd(), "TTS", "elevenlabs_monolingual_v1_accents_dialects.json");
        const content = await fs_1.promises.readFile(accentsFilePath, "utf8");
        const payload = JSON.parse(content);
        res.json(payload);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/tts
 * Body: { text: string; voiceId?: string; voice_id?: string }
 */
exports.ttsRouter.post("/", async (req, res, next) => {
    try {
        const { text, voiceId, voice_id } = req.body;
        if (!text || typeof text !== "string" || !text.trim()) {
            res.status(400).json({ error: "Request body must include a non-empty 'text' string." });
            return;
        }
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            res.status(503).json({ error: "ElevenLabs API key not configured on server." });
            return;
        }
        const requestedVoiceId = (typeof voiceId === "string" ? voiceId : voice_id)?.trim() ?? "";
        const targetVoiceId = requestedVoiceId ||
            process.env.ELEVENLABS_DEFAULT_VOICE_ID ||
            "fVVjLtJgnQI61CoImgHU";
        const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5";
        const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`, {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
            },
            body: JSON.stringify({
                text: text.trim(),
                model_id: modelId,
                voice_settings: {
                    stability: 0.75,
                    similarity_boost: 0.75,
                },
            }),
        });
        if (!elevenRes.ok) {
            const errText = await elevenRes.text();
            throw new Error(`ElevenLabs error ${elevenRes.status}: ${errText}`);
        }
        const audioBuffer = await elevenRes.arrayBuffer();
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Voice-Id", targetVoiceId);
        res.send(Buffer.from(audioBuffer));
    }
    catch (err) {
        next(err);
    }
});
