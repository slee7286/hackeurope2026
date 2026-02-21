import React, { useEffect } from 'react';
import type { UseSpeechToTextResult } from '../hooks/useSpeechToText';

interface VoiceControlsProps {
  stt: UseSpeechToTextResult;
  /** Called with the recognised text so the chat input can be pre-filled. */
  onTranscriptReady: (text: string) => void;
  disabled: boolean;
}

export function VoiceControls({ stt, onTranscriptReady, disabled }: VoiceControlsProps) {
  // Forward transcript to parent (ChatInterface input) when it arrives
  useEffect(() => {
    if (stt.transcript) {
      onTranscriptReady(stt.transcript);
    }
  }, [stt.transcript, onTranscriptReady]);

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        border: '1px solid var(--color-border)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        flexWrap: 'wrap',
      }}
    >
      {/* Section label */}
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

      {/* Speak / Stop button */}
      {!stt.isRecording ? (
        <button
          onClick={() => stt.startRecording()}
          disabled={disabled}
          aria-label="Start speaking"
          style={{
            background: disabled ? 'var(--color-border)' : 'var(--color-primary)',
            color: '#fff',
            fontSize: 'var(--font-size-base)',
            padding: '0.55em 1.1em',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          Speak
        </button>
      ) : (
        <button
          onClick={() => stt.stopRecording()}
          aria-label="Stop recording"
          style={{
            background: 'var(--color-danger)',
            color: '#fff',
            fontSize: 'var(--font-size-base)',
            padding: '0.55em 1.1em',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          Stop
        </button>
      )}

      {/* Recording pulse + label */}
      {stt.isRecording && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--color-danger)',
            fontWeight: 600,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: 'var(--color-danger)',
              animation: 'pulse 1s ease infinite',
            }}
          />
          Listening...
        </div>
      )}

      {/* Confirmation that transcript was received */}
      {stt.transcript && !stt.isRecording && (
        <div style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
          Added to input. Review and press Send.
        </div>
      )}

      {stt.error && <div style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>{stt.error}</div>}

      {/* Attribution */}
      <div
        style={{
          marginLeft: 'auto',
          fontSize: '13px',
          color: 'var(--color-text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        Powered by Google STT
      </div>
    </div>
  );
}