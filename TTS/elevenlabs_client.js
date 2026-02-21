"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

class ElevenLabsApiClientMock {
  constructor(options = {}) {
    this.maxDurationSeconds = options.maxDurationSeconds ?? 120;
    this.supportedLanguages = new Set(
      options.supportedLanguages ?? [
        "en",
        "es",
        "fr",
        "de",
        "it",
        "pt",
        "ja",
        "ko",
        "zh",
      ]
    );
    this.supportedMimeTypes = new Set(
      options.supportedMimeTypes ?? [
        "audio/webm",
        "audio/mpeg",
        "audio/mp4",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
      ]
    );
    this.apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY ?? "";
    this.adminLockedVoiceId =
      options.adminLockedVoiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "";
    this.defaultModelId = options.defaultModelId ?? "eleven_multilingual_v2";
    this.defaultOutputFormat = options.defaultOutputFormat ?? "mp3_44100_128";
  }

  transcribeFromJson(payload) {
    const {
      audioBuffer,
      mimeType,
      durationSeconds,
      languageHint = "en",
    } = payload ?? {};

    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw new Error("audioBuffer must be a non-empty Buffer");
    }
    if (!this.supportedMimeTypes.has(mimeType)) {
      throw new Error(`unsupported mimeType: ${mimeType}`);
    }
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
      throw new Error("durationSeconds must be a positive integer");
    }
    if (durationSeconds > this.maxDurationSeconds) {
      throw new Error(
        `durationSeconds must be <= ${this.maxDurationSeconds}`
      );
    }
    if (!this.supportedLanguages.has(languageHint)) {
      throw new Error(`unsupported language: ${languageHint}`);
    }

    const fingerprint = crypto
      .createHash("sha256")
      .update(audioBuffer)
      .digest("hex")
      .slice(0, 10);

    return {
      transcriptText: `mock transcript (${languageHint}) [${audioBuffer.length} bytes | ${fingerprint}]`,
      detectedLanguage: languageHint,
      provider: "elevenlabs",
    };
  }

  async synthesizeFromJson(payload) {
    const {
      text,
      language,
      accent = "default",
      voiceId,
      modelId,
      outputFormat,
      mockTone = false,
    } = payload ?? {};

    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("text must be a non-empty string");
    }
    if (!this.supportedLanguages.has(language)) {
      throw new Error(`unsupported language: ${language}`);
    }

    if (mockTone) {
      const durationSeconds = Math.min(8, Math.max(1, Math.ceil(text.length / 30)));
      const audioBuffer = createToneWavBuffer({
        durationSeconds,
        frequencyHz: 440,
        sampleRate: 22050,
        amplitude: 0.25,
      });
      return {
        provider: "elevenlabs",
        voiceId: this.adminLockedVoiceId || "mock_voice",
        language,
        accent,
        contentType: "audio/wav",
        fileExtension: ".wav",
        audioBuffer,
      };
    }

    if (!this.apiKey) {
      throw new Error(
        "Missing ElevenLabs API key. Set ELEVENLABS_API_KEY or pass apiKey to client."
      );
    }

    const resolvedVoiceId = await this.resolveVoiceId(voiceId);
    const resolvedModelId = modelId ?? this.defaultModelId;
    const resolvedOutputFormat = outputFormat ?? this.defaultOutputFormat;
    const url =
      "https://api.elevenlabs.io/v1/text-to-speech/" +
      encodeURIComponent(resolvedVoiceId) +
      "?output_format=" +
      encodeURIComponent(resolvedOutputFormat);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: resolvedModelId,
      }),
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      throw new Error(
        `ElevenLabs TTS failed (${response.status}): ${body || "no body"}`
      );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    return {
      provider: "elevenlabs",
      voiceId: resolvedVoiceId,
      language,
      accent,
      contentType,
      fileExtension: extensionFromContentType(contentType),
      audioBuffer,
    };
  }

  async resolveVoiceId(requestedVoiceId) {
    if (requestedVoiceId) {
      return requestedVoiceId;
    }
    if (this.adminLockedVoiceId) {
      return this.adminLockedVoiceId;
    }

    throw new Error(
      "No voiceId configured. Provide payload.voiceId or set ELEVENLABS_VOICE_ID."
    );
  }

  async createAudioHttpResponse(payload) {
    const ttsResult = await this.synthesizeFromJson(payload);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": ttsResult.contentType,
        "Content-Length": String(ttsResult.audioBuffer.length),
        "X-Provider": ttsResult.provider,
        "X-Voice-Id": ttsResult.voiceId,
      },
      body: ttsResult.audioBuffer,
    };
  }

  async writeSpeechFile({ audioBuffer, outputDir, fileName } = {}) {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw new Error("audioBuffer must be a non-empty Buffer");
    }

    const dir = outputDir ?? path.join(process.cwd(), "TTS", "mock_audio");
    await fs.mkdir(dir, { recursive: true });

    const finalFileName =
      fileName ?? `tts-${crypto.randomUUID()}${inferExtFromName(fileName)}`;
    const outPath = path.join(dir, finalFileName);
    await fs.writeFile(outPath, audioBuffer);

    return {
      path: outPath,
      bytes: audioBuffer.length,
    };
  }
}

function inferExtFromName(fileName) {
  if (typeof fileName === "string" && path.extname(fileName)) {
    return "";
  }
  return ".mp3";
}

function extensionFromContentType(contentType) {
  const lower = String(contentType).toLowerCase();
  if (lower.includes("wav")) return ".wav";
  if (lower.includes("mp4")) return ".m4a";
  if (lower.includes("ogg")) return ".ogg";
  return ".mp3";
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function createToneWavBuffer({
  durationSeconds,
  frequencyHz,
  sampleRate,
  amplitude,
}) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = sampleCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequencyHz * t) * amplitude;
    const int16 = Math.max(-1, Math.min(1, sample)) * 0x7fff;
    buffer.writeInt16LE(int16, 44 + i * bytesPerSample);
  }

  return buffer;
}

module.exports = {
  ElevenLabsApiClientMock,
};
