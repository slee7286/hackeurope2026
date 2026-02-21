import React, { useState, useCallback } from 'react';
import { Layout } from './components/Layout';
import { ChatInterface } from './components/ChatInterface';
import { VoiceControls } from './components/VoiceControls';
import { SessionHistory } from './components/SessionHistory';
import { useSession } from './hooks/useSession';
import { useSpeechToText } from './hooks/useSpeechToText';
import { useTextToSpeech } from './hooks/useTextToSpeech';

// TODO: Replace with the patient's saved voice preference fetched from backend.
// ElevenLabs voice IDs can be browsed at: https://elevenlabs.io/voice-library
const SELECTED_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Rachel — calm, clear

type View = 'home' | 'session' | 'history';

export default function App() {
  const [view, setView] = useState<View>('home');
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

  const sessionActive = state.status !== 'idle' && state.status !== 'starting';

  const handleStartSession = useCallback(async () => {
    setView('session');
    await start();
  }, [start]);

  return (
    <Layout showBackButton={view !== 'home'} onBackButtonClick={() => setView('home')}>
      {view === 'home' && (
        <section className="surface-panel fade-in">
          <h2 className="panel-title">Welcome</h2>
          <p className="panel-copy">Select what you would like to do.</p>
          <div className="home-actions">
            <button onClick={handleStartSession} className="btn-primary home-btn">
              Check into session
            </button>
            <button onClick={() => setView('history')} className="btn-secondary home-btn">
              Session history
            </button>
          </div>
        </section>
      )}

      {view === 'history' && (
        <section className="fade-in">
          <SessionHistory />
        </section>
      )}

      {view === 'session' && (
        <section className="fade-in session-flow">
          <div className="surface-panel session-panel">
            {state.status === 'idle' && (
              <div className="session-start">
                <p className="panel-copy">Press the button to start your session.</p>
                <button onClick={handleStartSession} className="btn-primary">
                  Check into session
                </button>
              </div>
            )}

            {state.status === 'starting' && <div className="session-loading">Getting ready...</div>}

            {state.error && (
              <div
                style={{
                  background: '#fff4f4',
                  border: '2px solid var(--color-danger)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 16px',
                  color: 'var(--color-danger)',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-base)',
                }}
              >
                {state.error}
              </div>
            )}

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
              >
                Audio: {tts.error}
              </div>
            )}

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
                  disabled={state.isLoading || state.status === 'completed' || state.status === 'finalizing'}
                />
              </>
            )}
          </div>
        </section>
      )}
    </Layout>
  );
}
