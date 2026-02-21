import { Router, Request, Response, NextFunction } from "express";

export const ttsRouter = Router();

/**
 * POST /api/tts
 * Body: { text: string; voiceId?: string }
 *
 * Proxies to the ElevenLabs Text-to-Speech API and returns audio/mpeg.
 * The API key is kept on the server — never exposed to the browser.
 *
 * Setup:
 *   1. Create an account at https://elevenlabs.io
 *   2. Copy your API key to .env as ELEVENLABS_API_KEY
 *   3. Optionally set ELEVENLABS_DEFAULT_VOICE_ID (fallback when voiceId is omitted)
 *      Browse voices: https://elevenlabs.io/voice-library
 *
 * ElevenLabs TTS docs:
 *   https://elevenlabs.io/docs/api-reference/text-to-speech
 */
ttsRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text, voiceId } = req.body as { text?: string; voiceId?: string };

      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "Request body must include a non-empty 'text' string." });
        return;
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        // TODO: Add ELEVENLABS_API_KEY=<your-key> to .env
        res.status(503).json({ error: "ElevenLabs API key not configured on server." });
        return;
      }

      // Use the provided voiceId, env default, or the ElevenLabs "Rachel" voice
      const targetVoiceId =
        voiceId ??
        process.env.ELEVENLABS_DEFAULT_VOICE_ID ??
        "EXAVITQu4vr4xnSDxMaL"; // Rachel — calm, clear, good for therapy

      // Call ElevenLabs TTS REST API
      const elevenRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: text.trim(),
            model_id: "eleven_monolingual_v1",
            voice_settings: {
              stability: 0.75,        // Higher = more consistent pacing (good for therapy)
              similarity_boost: 0.75, // Balance naturalness vs. voice consistency
            },
          }),
        }
      );

      if (!elevenRes.ok) {
        const errText = await elevenRes.text();
        throw new Error(`ElevenLabs error ${elevenRes.status}: ${errText}`);
      }

      // Stream audio back to the browser
      const audioBuffer = await elevenRes.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-cache");
      res.send(Buffer.from(audioBuffer));
    } catch (err) {
      next(err);
    }
  }
);
