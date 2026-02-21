import { useState, useRef, useCallback } from 'react';

export interface UseTextToSpeechResult {
  isPlaying: boolean;
  error: string | null;
  speak: (text: string, voiceId: string) => Promise<void>;
  stop: () => void;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
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
        // Call our backend proxy; never expose the API key to the browser
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

        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        objectUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(audioUrl);
          objectUrlRef.current = null;
        };

        audio.onerror = () => {
          setError('Audio playback failed.');
          setIsPlaying(false);
        };

        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not play audio.');
        setIsPlaying(false);
      }
    },
    [stop]
  );

  return { isPlaying, error, speak, stop };
}
