"use strict";

const fs = require("fs/promises");
const path = require("path");
const { ElevenLabsApiClientMock } = require("./elevenlabs_client");

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error(
      "Usage: node TTS/generate_speech_from_json.js <payload.json>"
    );
  }

  const raw = await fs.readFile(inputPath, "utf8");
  const payload = JSON.parse(raw);
  const apiKey = await resolveApiKey();

  const client = new ElevenLabsApiClientMock({
    apiKey,
    adminLockedVoiceId:
      payload.voiceId || process.env.ELEVENLABS_VOICE_ID || undefined,
  });

  const ttsResult = await client.synthesizeFromJson({
    text: payload.text,
    language: payload.language,
    accent: payload.accent,
    voiceId: payload.voiceId,
    modelId: payload.modelId,
    outputFormat: payload.outputFormat,
    mockTone: payload.mockTone === true,
  });

  const fileName = payload.fileName || `question_prompt${ttsResult.fileExtension}`;
  const out = await client.writeSpeechFile({
    audioBuffer: ttsResult.audioBuffer,
    outputDir: path.join(process.cwd(), "TTS", "mock_audio"),
    fileName,
  });

  process.stdout.write(
    JSON.stringify(
      {
        provider: ttsResult.provider,
        voiceId: ttsResult.voiceId,
        contentType: ttsResult.contentType,
        path: out.path,
        bytes: out.bytes,
      },
      null,
      2
    ) + "\n"
  );
}

async function resolveApiKey() {
  if (process.env.ELEVENLABS_API_KEY) {
    return process.env.ELEVENLABS_API_KEY;
  }

  const fromFileEnv = process.env.ELEVENLABS_API_KEY_FILE;
  const candidateFiles = [
    fromFileEnv,
    path.join(process.cwd(), "definitely not ApiKeys", "api_keys.json"),
    path.join(process.cwd(), "dontlookhere", "DefinitelyNotApiKeys"),
  ].filter(Boolean);

  for (const filePath of candidateFiles) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const json = JSON.parse(content);
      const key = json.elevenlabs_api_key;
      if (typeof key === "string" && key.trim().length > 0) {
        return key.trim();
      }
    } catch {
      // Continue scanning candidates.
    }
  }

  return "";
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});


