import React, { useState, useCallback } from 'react';
import { Layout } from './components/Layout';
import { PatientHeader } from './components/PatientHeader';
import { ChatInterface } from './components/ChatInterface';
import { VoiceControls } from './components/VoiceControls';
import { GameTab } from './components/GameTab';
import { useSession } from './hooks/useSession';
import { useSpeechToText } from './hooks/useSpeechToText';
import { useTextToSpeech } from './hooks/useTextToSpeech';

// TODO: Replace with the patient's saved voice preference fetched from backend.
// ElevenLabs voice IDs can be browsed at: https://elevenlabs.io/voice-library
const SELECTED_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Rachel — calm, clear

type View = 'session' | 'game';

export default function App() {
  const [view, setView] = useState<View>('session');
  const { state, start, send } = useSession();
  const stt = useSpeechToText();
  const tts = useTextToSpeech();

  // Bridge: voice transcript → chat input pre-fill
  const [pendingVoiceInput, setPendingVoiceInput] = useState('');

  const handleTranscriptReady = useCallback(
    (text: string) => {
      setPendingVoiceInput(text);
      stt.clearTranscript(); // Reset so the effect won't re-fire
    },
    [stt]
  );

  const handleVoiceInputConsumed = useCallback(() => {
    setPendingVoiceInput('');
  }, []);

  const sessionActive =
    state.status !== 'idle' && state.status !== 'starting';

  const planReady = state.status === 'completed' && !!state.plan;

  return (
    <Layout>
      {/* ── Patient header + Duolingo-style progress ───────────────────── */}
      <PatientHeader patientId={state.patientId} />

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="app-tab-bar">
        <button
          className={`app-tab${view === 'session' ? ' active' : ''}`}
          onClick={() => setView('session')}
        >
          Check-in
        </button>
        <button
          className={`app-tab${view === 'game' ? ' active' : ''}`}
          onClick={() => setView('game')}
          disabled={!planReady && view !== 'game'}
          title={planReady ? undefined : 'Complete a check-in session to unlock practice'}
        >
          Practice
          {planReady && <span className="app-tab-dot" aria-hidden="true" />}
        </button>
      </div>

      {/* ── Session / Check-in view ────────────────────────────────────── */}
      {view === 'session' && (
        <>
          {/* Session start screen */}
          {state.status === 'idle' && (
            <div
              style={{
                textAlign: 'center',
                padding: '28px 0 10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  fontSize: 'var(--font-size-base)',
                  color: 'var(--color-text-muted)',
                  maxWidth: '400px',
                }}
              >
                Press the button to start your session. We will ask a few short questions first.
              </div>
              <button
                onClick={start}
                style={{
                  background: 'var(--color-accent)',
                  color: '#fff',
                  fontSize: 'var(--font-size-xl)',
                  padding: '0.65em 2.2em',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                Start session
              </button>
            </div>
          )}

          {state.status === 'starting' && (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                padding: '24px 0',
                fontSize: 'var(--font-size-lg)',
              }}
            >
              Getting ready…
            </div>
          )}

          {/* Error notice */}
          {state.error && (
            <div
              style={{
                background: '#fef2f2',
                border: '2px solid var(--color-danger)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 16px',
                color: 'var(--color-danger)',
                fontWeight: 600,
                fontSize: 'var(--font-size-base)',
              }}
              role="alert"
            >
              {state.error}
            </div>
          )}

          {/* TTS error notice */}
          {tts.error && (
            <div
              style={{
                background: '#fff7ed',
                border: '1.5px solid var(--color-warning)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 14px',
                color: 'var(--color-warning)',
                fontSize: 'var(--font-size-sm)',
              }}
              role="alert"
            >
              Audio: {tts.error}
            </div>
          )}

          {/* Chat + voice controls */}
          {sessionActive && (
            <>
              <ChatInterface
                messages={state.messages}
                status={state.status}
                plan={state.plan}
                isLoading={state.isLoading}
                onSend={send}
                voiceInput={pendingVoiceInput}
                onVoiceInputConsumed={handleVoiceInputConsumed}
                tts={tts}
                selectedVoiceId={SELECTED_VOICE_ID}
              />

              <VoiceControls
                stt={stt}
                onTranscriptReady={handleTranscriptReady}
                disabled={
                  state.isLoading ||
                  state.status === 'completed' ||
                  state.status === 'finalizing'
                }
              />

              {/* CTA: navigate to practice once plan is ready */}
              {planReady && (
                <div style={{ textAlign: 'center', paddingTop: 4 }}>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 'var(--font-size-lg)', padding: '0.65em 2em' }}
                    onClick={() => setView('game')}
                  >
                    Start Practice →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Practice / Game view ───────────────────────────────────────── */}
      {view === 'game' && (
        <GameTab
          plan={state.plan}
          onGoHome={() => setView('session')}
          tts={tts}
          stt={stt}
          selectedVoiceId={SELECTED_VOICE_ID}
        />
      )}
    </Layout>
  );
}
