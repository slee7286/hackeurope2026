import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { UseSpeechToTextResult } from '../hooks/useSpeechToText';

interface VoiceControlsProps {
  stt: UseSpeechToTextResult;
  /** Called with the recognised text so it can be sent to the session. */
  onTranscriptReady: (text: string) => void;
  disabled: boolean;
  embedded?: boolean;
  buttonsOnly?: boolean;
}

const MIN_HOLD_DURATION_MS = 150;

export function VoiceControls({
  stt,
  onTranscriptReady,
  disabled,
  embedded = false,
  buttonsOnly = false,
}: VoiceControlsProps) {
  const [holdHint, setHoldHint] = useState<string | null>(null);
  const holdStartTimeRef = useRef<number | null>(null);

  // Forward transcript to parent when it arrives
  useEffect(() => {
    if (stt.transcript) {
      setHoldHint(null);
      onTranscriptReady(stt.transcript);
    }
  }, [stt.transcript, onTranscriptReady]);

  const handleRecordMouseDown = useCallback(async () => {
    if (disabled || stt.isRecording || stt.isTranscribing) return;
    setHoldHint(null);
    holdStartTimeRef.current = Date.now();
    await stt.startRecording();
  }, [disabled, stt]);

  const handleRecordMouseUp = useCallback(() => {
    if (!stt.isRecording) return;

    const heldMs = holdStartTimeRef.current ? Date.now() - holdStartTimeRef.current : 0;
    holdStartTimeRef.current = null;
    const isTooShort = heldMs < MIN_HOLD_DURATION_MS;

    stt.stopRecording({ discard: isTooShort });
    if (isTooShort) {
      setHoldHint('Press and hold to talk.');
    }
  }, [stt]);

  return (
    <div
      style={{
        background: embedded ? 'transparent' : 'var(--color-surface)',
        borderRadius: embedded ? 0 : 'var(--radius)',
        boxShadow: embedded ? 'none' : 'var(--shadow)',
        border: embedded ? 'none' : '1px solid var(--color-border)',
        padding: embedded ? '0' : '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        flexWrap: 'wrap',
      }}
    >
      {!buttonsOnly && (
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            fontWeight: 600,
            marginRight: '2px',
          }}
        >
          Voice input:
        </span>
      )}

      <button
        onMouseDown={handleRecordMouseDown}
        onMouseUp={handleRecordMouseUp}
        onMouseLeave={handleRecordMouseUp}
        disabled={disabled || stt.isTranscribing}
        aria-label="Press and hold to record counselling response"
        style={{
          background:
            disabled || stt.isTranscribing
              ? 'var(--color-border)'
              : stt.isRecording
                ? 'var(--color-danger)'
                : 'var(--color-primary)',
          color: '#fff',
          fontSize: 'var(--font-size-base)',
          padding: '0.55em 1.4em',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        {stt.isRecording ? 'Recording...' : stt.isTranscribing ? 'Transcribing...' : 'Hold to Talk'}
      </button>

      {!buttonsOnly && (
        <>
          {/* Recording indicator */}
          {stt.isRecording && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--color-danger)',
                fontWeight: 600,
                fontSize: 'var(--font-size-sm)',
              }}
              aria-live="assertive"
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--color-danger)',
                  animation: 'pulse 1s ease infinite',
                }}
                aria-hidden="true"
              />
              Recording... release to stop.
            </div>
          )}

          {stt.isTranscribing && (
            <div
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
              }}
              aria-live="polite"
            >
              Transcribing...
            </div>
          )}

          {holdHint && (
            <div
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
              }}
              role="status"
            >
              {holdHint}
            </div>
          )}

          {/* Confirmation that transcript was received */}
          {stt.transcript && !stt.isRecording && (
            <div
              style={{
                color: 'var(--color-accent)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
              }}
            >
              Voice input captured and sent.
            </div>
          )}

          {stt.error && (
            <div
              style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}
              role="alert"
            >
              {stt.error}
            </div>
          )}

          {/* Attribution */}
          <div
            style={{
              marginLeft: 'auto',
              fontSize: '13px',
              color: 'var(--color-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            Google Speech-to-Text
          </div>
        </>
      )}
    </div>
  );
}
