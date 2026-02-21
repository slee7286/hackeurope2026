"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sttRouter = void 0;
const express_1 = require("express");
exports.sttRouter = (0, express_1.Router)();
/**
 * POST /api/stt
 * Body: raw audio bytes  (Content-Type: audio/webm  or  audio/webm;codecs=opus)
 *
 * Proxies to the Google Cloud Speech-to-Text REST API and returns:
 *   { transcript: string }
 *
 * Setup:
 *   1. Enable Speech-to-Text at: https://console.cloud.google.com/apis/library/speech.googleapis.com
 *   2. Create an API key (Credentials → Create credentials → API key) and restrict it
 *      to the Speech-to-Text API.
 *   3. Add GOOGLE_STT_API_KEY=<your-key> to .env
 *
 * Google STT REST docs:
 *   https://cloud.google.com/speech-to-text/docs/reference/rest/v1/speech/recognize
 *
 * NOTE: This route uses express.raw() middleware (mounted in server.ts)
 * so req.body is a Buffer containing the raw audio bytes.
 */
exports.sttRouter.post("/", async (req, res, next) => {
    try {
        const apiKey = process.env.GOOGLE_STT_API_KEY;
        if (!apiKey) {
            // TODO: Add GOOGLE_STT_API_KEY=<your-key> to .env
            res.status(503).json({ error: "Google STT API key not configured on server." });
            return;
        }
        const audioBuffer = req.body;
        if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
            res.status(400).json({ error: "No audio data received." });
            return;
        }
        // Base64-encode the audio for the REST API
        const audioBase64 = audioBuffer.toString("base64");
        // Detect encoding from Content-Type header (default: WEBM_OPUS)
        const contentType = (req.headers["content-type"] ?? "audio/webm");
        const encoding = contentType.includes("mp4") ? "MP4" : "WEBM_OPUS";
        const googleRes = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                config: {
                    encoding, // Matches MediaRecorder output from browsers
                    sampleRateHertz: 48000, // Standard for WebM/Opus
                    languageCode: "en-US",
                    enableAutomaticPunctuation: false,
                    model: "default",
                    // Aphasia-specific phrase hints improve recognition of common words.
                    // TODO: Tune these phrases based on therapy content:
                    // speechContexts: [
                    //   { phrases: ["family", "cooking", "music", "sports", "travel"], boost: 10 }
                    // ],
                },
                audio: { content: audioBase64 },
            }),
        });
        if (!googleRes.ok) {
            const errText = await googleRes.text();
            throw new Error(`Google STT error ${googleRes.status}: ${errText}`);
        }
        const data = (await googleRes.json());
        // Extract the top transcript (empty string if nothing was recognized)
        const transcript = data.results?.[0]?.alternatives?.[0]?.transcript ?? "";
        res.json({ transcript });
    }
    catch (err) {
        next(err);
    }
});
