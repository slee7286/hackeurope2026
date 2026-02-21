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

interface TtsRequestBody {
  text?: string;
  voiceId?: string;
  voice_id?: string;
}

interface CharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface TtsWithTimestampsResponse {
  audio_base64: string;
  alignment: CharacterAlignment | null;
  normalized_alignment: CharacterAlignment | null;
}

interface WordTiming {
  word: string;
  start: number;
  end: number;
}

function resolveTargetVoiceId(body: TtsRequestBody): string {
  const requestedVoiceId =
    (typeof body.voiceId === "string" ? body.voiceId : body.voice_id)?.trim() ?? "";

  return (
    requestedVoiceId ||
    process.env.ELEVENLABS_DEFAULT_VOICE_ID ||
    "fVVjLtJgnQI61CoImgHU"
  );
}

function deriveWordTimings(alignment: CharacterAlignment | null): WordTiming[] {
  if (!alignment) return [];

  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const length = Math.min(
    characters.length,
    character_start_times_seconds.length,
    character_end_times_seconds.length
  );

  if (length === 0) return [];

  const results: WordTiming[] = [];
  let currentWord = "";
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  const pushWord = () => {
    if (!currentWord) return;
    const start = Number.isFinite(currentStart) ? (currentStart as number) : 0;
    const end = Number.isFinite(currentEnd) ? (currentEnd as number) : start;
    results.push({
      word: currentWord,
      start,
      end: end >= start ? end : start,
    });
    currentWord = "";
    currentStart = null;
    currentEnd = null;
  };

  for (let i = 0; i < length; i += 1) {
    const char = characters[i] ?? "";
    const start = character_start_times_seconds[i] ?? 0;
    const end = character_end_times_seconds[i] ?? start;

    if (/\s/.test(char)) {
      pushWord();
      continue;
    }

    if (!currentWord) {
      currentStart = start;
    }

    currentWord += char;
    currentEnd = end;
  }

  pushWord();
  return results;
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
 * Body: { text: string; voiceId?: string; voice_id?: string; speechRate?: number }
 */
ttsRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text, voiceId, voice_id, speechRate } = req.body as {
        text?: string;
        voiceId?: string;
        voice_id?: string;
        speechRate?: number;
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
      const requestedSpeechRate =
        typeof speechRate === "number" && Number.isFinite(speechRate)
          ? speechRate
          : 1;
      const clampedSpeechRate = Math.min(1.2, Math.max(0.7, requestedSpeechRate));

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
              speed: clampedSpeechRate,
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
      res.setHeader("X-Speech-Rate", String(clampedSpeechRate));
      res.send(Buffer.from(audioBuffer));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/tts/with-timestamps
 * Body: { text: string; voiceId?: string; voice_id?: string }
 *
 * Returns:
 * {
 *   audioBase64: string,
 *   wordTimings: Array<{ word: string; start: number; end: number }>,
 *   voiceId: string
 * }
 */
ttsRouter.post(
  "/with-timestamps",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as TtsRequestBody;
      const text = body.text;

      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "Request body must include a non-empty 'text' string." });
        return;
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        res.status(503).json({ error: "ElevenLabs API key not configured on server." });
        return;
      }

      const targetVoiceId = resolveTargetVoiceId(body);
      const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5";

      const elevenRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}/with-timestamps`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
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
        throw new Error(`ElevenLabs timestamp error ${elevenRes.status}: ${errText}`);
      }

      const payload = (await elevenRes.json()) as TtsWithTimestampsResponse;
      const alignment = payload.alignment ?? payload.normalized_alignment;
      const wordTimings = deriveWordTimings(alignment);

      if (!payload.audio_base64) {
        throw new Error("ElevenLabs did not return audio_base64.");
      }

      res.json({
        audioBase64: payload.audio_base64,
        wordTimings,
        voiceId: targetVoiceId,
      });
    } catch (err) {
      next(err);
    }
  }
);

