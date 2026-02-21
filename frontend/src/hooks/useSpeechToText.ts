import { useState, useRef, useCallback } from 'react';

export interface StopRecordingOptions {
  discard?: boolean;
}

export interface UseSpeechToTextResult {
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: (options?: StopRecordingOptions) => void;
  clearTranscript: () => void;
}

/**
 * useSpeechToText
 *
 * Records audio via the browser MediaRecorder API and sends it to the
 * backend proxy at POST /api/stt, which forwards to Google Cloud STT.
 *
 * Backend setup (see src/routes/stt.ts):
 *   - Add GOOGLE_STT_API_KEY to .env (a GCP API key with Speech-to-Text enabled)
 *   - The route accepts raw audio/webm and returns { transcript: string }
 *
 * Browser compatibility:
 *   - Chrome, Edge, Firefox: full support
 *   - Safari: partial (audio/mp4 may be needed instead of audio/webm)
 *     TODO: detect MIME type via MediaRecorder.isTypeSupported() for Safari
 */
export function useSpeechToText(): UseSpeechToTextResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const discardOnStopRef = useRef(false);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setIsTranscribing(false);

    // Request microphone permission
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access denied. Please allow microphone use.');
      return;
    }

    // Pick a supported MIME type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];
    discardOnStopRef.current = false;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      // Release the microphone immediately
      stream.getTracks().forEach((t) => t.stop());

      if (discardOnStopRef.current) {
        discardOnStopRef.current = false;
        audioChunksRef.current = [];
        return;
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      setIsTranscribing(true);

      try {
        // Send raw audio to our backend proxy -> Google Cloud STT
        const res = await fetch('/api/stt', {
          method: 'POST',
          headers: { 'Content-Type': mimeType },
          body: audioBlob,
        });

        if (!res.ok) {
          throw new Error(`Speech recognition failed (${res.status})`);
        }

        const data = (await res.json()) as { transcript: string };
        setTranscript(data.transcript || '');

        if (!data.transcript) {
          setError("Couldn't hear that clearly. Please try again.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Transcription failed.');
      } finally {
        setIsTranscribing(false);
      }
    };

    mediaRecorder.start();
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(
    (options?: StopRecordingOptions) => {
      if (mediaRecorderRef.current && isRecording) {
        discardOnStopRef.current = Boolean(options?.discard);
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    },
    [isRecording]
  );

  const clearTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return {
    isRecording,
    isTranscribing,
    transcript,
    error,
    startRecording,
    stopRecording,
    clearTranscript,
  };
}
