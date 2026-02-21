import { useState, useRef, useCallback } from 'react';

export interface SpokenWordTiming {
  word: string;
  start: number;
  end: number;
}

export interface UseTextToSpeechResult {
  isPlaying: boolean;
  error: string | null;
  currentAudio: HTMLAudioElement | null;
  currentText: string | null;
  currentWordTimings: SpokenWordTiming[];
  speak: (text: string, voiceId: string) => Promise<void>;
  stop: () => void;
}

interface TtsWithTimestampsPayload {
  audioBase64: string;
  wordTimings?: SpokenWordTiming[];
}

function decodeBase64ToAudioBlob(base64: string): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'audio/mpeg' });
}

function sanitizeWordTimings(value: unknown): SpokenWordTiming[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Partial<SpokenWordTiming>;
      if (
        typeof candidate.word !== 'string' ||
        !Number.isFinite(candidate.start) ||
        !Number.isFinite(candidate.end)
      ) {
        return null;
      }
      const start = candidate.start as number;
      const end = candidate.end as number;
      return {
        word: candidate.word,
        start: Math.max(0, start),
        end: Math.max(start, end),
      };
    })
    .filter((item): item is SpokenWordTiming => item !== null);
}

/**
 * useTextToSpeech
 *
 * Sends text to POST /api/tts (backend proxy → ElevenLabs) and plays
 * the returned audio/mpeg in the browser.
 *
 * Backend setup (see src/routes/tts.ts):
 *   - Add ELEVENLABS_API_KEY to .env
 *   - Optionally set ELEVENLABS_DEFAULT_VOICE_ID for a fallback voice
 *
 * The voiceId should come from the patient's saved preferences.
 * For now, App.tsx uses a placeholder constant.
 */
export function useTextToSpeech(): UseTextToSpeechResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [currentText, setCurrentText] = useState<string | null>(null);
  const [currentWordTimings, setCurrentWordTimings] = useState<SpokenWordTiming[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setCurrentAudio(null);
    setCurrentText(null);
    setCurrentWordTimings([]);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const speak = useCallback(
    async (text: string, voiceId: string) => {
      stop(); // Cancel any currently playing audio
      setError(null);

      try {
        setCurrentText(text);
        setCurrentWordTimings([]);

        let audioBlob: Blob | null = null;

        const withTimestampsResponse = await fetch('/api/tts/with-timestamps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceId }),
        });

        if (withTimestampsResponse.ok) {
          const payload = (await withTimestampsResponse.json()) as TtsWithTimestampsPayload;
          if (typeof payload.audioBase64 === 'string' && payload.audioBase64.length > 0) {
            audioBlob = decodeBase64ToAudioBlob(payload.audioBase64);
            setCurrentWordTimings(sanitizeWordTimings(payload.wordTimings));
          }
        }

        if (!audioBlob) {
          // Fallback to audio-only endpoint when timestamps are unavailable.
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voiceId }),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error((body as { error?: string }).error ?? `TTS failed (${res.status})`);
          }

          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          if (!contentType.startsWith('audio/')) {
            const bodyText = await res.text().catch(() => '');
            throw new Error(bodyText || 'TTS response was not audio.');
          }

          audioBlob = await res.blob();
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        objectUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setCurrentAudio(audio);

        audio.onended = () => {
          setIsPlaying(false);
          if (audioRef.current === audio) {
            audioRef.current = null;
            setCurrentAudio(null);
          }
          setCurrentText(null);
          setCurrentWordTimings([]);
          if (objectUrlRef.current === audioUrl) {
            URL.revokeObjectURL(audioUrl);
            objectUrlRef.current = null;
          }
        };

        audio.onerror = () => {
          setError('Audio playback failed.');
          setIsPlaying(false);
          if (audioRef.current === audio) {
            audioRef.current = null;
            setCurrentAudio(null);
          }
          setCurrentText(null);
          setCurrentWordTimings([]);
          if (objectUrlRef.current === audioUrl) {
            URL.revokeObjectURL(audioUrl);
            objectUrlRef.current = null;
          }
        };

        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        if (audioRef.current) {
          stop();
        }
        setCurrentText(null);
        setCurrentWordTimings([]);
        setError(err instanceof Error ? err.message : 'Could not play audio.');
        setIsPlaying(false);
      }
    },
    [stop]
  );

  return { isPlaying, error, currentAudio, currentText, currentWordTimings, speak, stop };
}
