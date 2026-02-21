import { Router, Request, Response, NextFunction } from "express";
import { promises as fs } from "fs";
import path from "path";

export const ttsRouter = Router();

interface AccentVoiceEntry {
  language: string;
  language_id: string;
  dialect: string;
  accent: string;
  accent_description: string;
  voice_id: string;
}

interface AccentVoicePayload {
  source: string;
  model: {
    id: string;
    name: string;
  };
  voices: AccentVoiceEntry[];
}

/**
 * GET /api/tts/voices
 * Returns accent/dialect voice metadata from TTS/elevenlabs_monolingual_v1_accents_dialects.json.
 */
ttsRouter.get(
  "/voices",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const accentsFilePath = path.join(
        process.cwd(),
        "TTS",
        "elevenlabs_monolingual_v1_accents_dialects.json"
      );

      const content = await fs.readFile(accentsFilePath, "utf8");
      const payload = JSON.parse(content) as AccentVoicePayload;
      res.json(payload);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/tts
 * Body: { text: string; voiceId?: string; voice_id?: string }
 */
ttsRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text, voiceId, voice_id } = req.body as {
        text?: string;
        voiceId?: string;
        voice_id?: string;
      };

      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "Request body must include a non-empty 'text' string." });
        return;
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        res.status(503).json({ error: "ElevenLabs API key not configured on server." });
        return;
      }

      const requestedVoiceId =
        (typeof voiceId === "string" ? voiceId : voice_id)?.trim() ?? "";

      const targetVoiceId =
        requestedVoiceId ||
        process.env.ELEVENLABS_DEFAULT_VOICE_ID ||
        "fVVjLtJgnQI61CoImgHU";

      const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5";

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
            model_id: modelId,
            voice_settings: {
              stability: 0.75,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!elevenRes.ok) {
        const errText = await elevenRes.text();
        throw new Error(`ElevenLabs error ${elevenRes.status}: ${errText}`);
      }

      const audioBuffer = await elevenRes.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Voice-Id", targetVoiceId);
      res.send(Buffer.from(audioBuffer));
    } catch (err) {
      next(err);
    }
  }
);

