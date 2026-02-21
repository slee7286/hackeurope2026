import React, { useState, useCallback } from 'react';
import { Layout } from './components/Layout';
import { ChatInterface } from './components/ChatInterface';
import { VoiceControls } from './components/VoiceControls';
import { SessionHistory } from './components/SessionHistory';
import { AdminVoiceSettings } from './components/AdminVoiceSettings';
import { useSession } from './hooks/useSession';
import { useSpeechToText } from './hooks/useSpeechToText';
import { useTextToSpeech } from './hooks/useTextToSpeech';

const DEFAULT_VOICE_ID = 'fVVjLtJgnQI61CoImgHU';
const VOICE_STORAGE_KEY = 'therapy.selected_voice_id';

type View = 'home' | 'session' | 'history' | 'admin';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    () => localStorage.getItem(VOICE_STORAGE_KEY) ?? DEFAULT_VOICE_ID
  );

  const { state, start, send } = useSession();
  const stt = useSpeechToText();
  const tts = useTextToSpeech();

  const [pendingVoiceInput, setPendingVoiceInput] = useState('');

  const handleTranscriptReady = useCallback(
    (text: string) => {
      setPendingVoiceInput(text);
      stt.clearTranscript();
    },
    [stt]
  );

  const handleVoiceInputConsumed = useCallback(() => {
    setPendingVoiceInput('');
  }, []);

  const handleApplyVoice = useCallback((nextVoiceId: string) => {
    setSelectedVoiceId(nextVoiceId);
    localStorage.setItem(VOICE_STORAGE_KEY, nextVoiceId);
    setView('home');
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
            <button
              onClick={() => setView('admin')}
              className="admin-fab"
              aria-label="Open admin voice settings"
              title="Admin voice settings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="9" cy="8" r="3" />
                <path d="M4 18a5 5 0 0 1 10 0v1H4v-1z" />
                <path d="M16 9c1.1.4 2 1.5 2 2.8S17.1 14.2 16 14.6" />
                <path d="M18.5 7.5c2 1 3.2 2.8 3.2 4.3s-1.2 3.3-3.2 4.3" />
              </svg>
            </button>
          </div>
          <p className="voice-chip">Current voice ID: {selectedVoiceId}</p>
        </section>
      )}

      {view === 'admin' && <AdminVoiceSettings currentVoiceId={selectedVoiceId} onApply={handleApplyVoice} />}

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
                <div className="session-start-actions">
                  <button onClick={handleStartSession} className="btn-primary">
                    Check into session
                  </button>
                  <button onClick={() => setView('admin')} className="btn-secondary">
                    Admin settings
                  </button>
                </div>
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
                  selectedVoiceId={selectedVoiceId}
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

