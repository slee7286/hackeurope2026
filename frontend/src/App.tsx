import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { VoiceControls } from './components/VoiceControls';
import { SessionHistory } from './components/SessionHistory';
import { AdminVoiceSettings } from './components/AdminVoiceSettings';
import { GameTab } from './components/GameTab';
import { SpeechIndicatorOrb } from './components/SpeechIndicatorOrb';
import { useSession } from './hooks/useSession';
import { useSpeechToText } from './hooks/useSpeechToText';
import { useTextToSpeech } from './hooks/useTextToSpeech';

const DEFAULT_VOICE_ID = 'fVVjLtJgnQI61CoImgHU';
const DEFAULT_SPEECH_RATE = 0.8;
const VOICE_STORAGE_KEY = 'therapy.selected_voice_id';
const VOICE_DESCRIPTOR_STORAGE_KEY = 'therapy.selected_voice_descriptor';
const CAPTIONS_STORAGE_KEY = 'therapy.captions_enabled';
const SPEECH_RATE_STORAGE_KEY = 'therapy.speech_rate';

type View = 'home' | 'session' | 'history' | 'admin';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [activePracticePrompt, setActivePracticePrompt] = useState<string | null>(null);
  const [practiceVoiceInput, setPracticeVoiceInput] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    () => localStorage.getItem(VOICE_STORAGE_KEY) ?? DEFAULT_VOICE_ID
  );
  const [selectedVoiceDescriptor, setSelectedVoiceDescriptor] = useState<string>(
    () => localStorage.getItem(VOICE_DESCRIPTOR_STORAGE_KEY) ?? ''
  );
  const [speechRate, setSpeechRate] = useState<number>(() => {
    const stored = localStorage.getItem(SPEECH_RATE_STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (Number.isFinite(parsed) && parsed >= 0.7 && parsed <= 1.2) {
      return parsed;
    }
    return DEFAULT_SPEECH_RATE;
  });
  const [captionsEnabled, setCaptionsEnabled] = useState<boolean>(
    () => localStorage.getItem(CAPTIONS_STORAGE_KEY) !== '0'
  );
  const lastAutoPlayedAiMessageKeyRef = useRef<string | null>(null);

  const { state, start, send, demoSkip } = useSession();
  const stt = useSpeechToText();
  const tts = useTextToSpeech();
  const { speak } = tts;
  const sessionActive = state.status !== 'idle' && state.status !== 'starting';
  const planReady = state.status === 'completed' && !!state.plan;
  const latestAiMessage = [...state.messages].reverse().find((message) => message.role === 'ai')?.text ?? '';

  const handleTranscriptReady = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      stt.clearTranscript();
      if (!trimmed) return;
      if (planReady) {
        setPracticeVoiceInput(trimmed);
        return;
      }
      void send(trimmed);
    },
    [planReady, send, stt]
  );

  const handlePracticeVoiceInputConsumed = useCallback(() => {
    setPracticeVoiceInput('');
  }, []);

  const handleApplyVoice = useCallback((nextVoiceId: string, nextSpeechRate: number, nextDescriptor: string) => {
    setSelectedVoiceId(nextVoiceId);
    setSpeechRate(nextSpeechRate);
    setSelectedVoiceDescriptor(nextDescriptor);
    localStorage.setItem(VOICE_STORAGE_KEY, nextVoiceId);
    localStorage.setItem(SPEECH_RATE_STORAGE_KEY, String(nextSpeechRate));
    localStorage.setItem(VOICE_DESCRIPTOR_STORAGE_KEY, nextDescriptor);
    setView('home');
  }, []);

  const handleCaptionsToggle = useCallback((enabled: boolean) => {
    setCaptionsEnabled(enabled);
    localStorage.setItem(CAPTIONS_STORAGE_KEY, enabled ? '1' : '0');
  }, []);

  useEffect(() => {
    if (view !== 'session') return;

    let latestAiMessageIndex = -1;
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      if (state.messages[i].role === 'ai') {
        latestAiMessageIndex = i;
        break;
      }
    }

    if (latestAiMessageIndex < 0) return;

    const nextAiMessage = state.messages[latestAiMessageIndex]?.text?.trim();
    if (!nextAiMessage) return;

    const nextAiMessageKey = `${state.sessionId ?? 'no-session'}:${latestAiMessageIndex}:${nextAiMessage}`;
    if (nextAiMessageKey === lastAutoPlayedAiMessageKeyRef.current) return;

    lastAutoPlayedAiMessageKeyRef.current = nextAiMessageKey;
    void speak(nextAiMessage, selectedVoiceId, speechRate);
  }, [view, state.messages, state.sessionId, selectedVoiceId, speechRate, speak]);

  const handleStartSession = useCallback(async () => {
    setActivePracticePrompt(null);
    setPracticeVoiceInput('');
    setView('session');
    await start();
  }, [start]);

  const handleDemoSkip = useCallback(async () => {
    setActivePracticePrompt(null);
    setPracticeVoiceInput('');
    setView('session');
    await demoSkip();
  }, [demoSkip]);

  const handleGoHome = useCallback(() => {
    setActivePracticePrompt(null);
    setPracticeVoiceInput('');
    setView('home');
  }, []);

  const playbackText = planReady ? activePracticePrompt ?? '' : latestAiMessage;
  const playbackButtonLabel = planReady ? 'Play prompt' : 'Repeat response';
  const playbackButtonTitle = planReady ? 'Play the current practice prompt' : 'Repeat the latest AI response';

  return (
    <Layout showBackButton={view !== 'home'} onBackButtonClick={handleGoHome}>
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
          <p className="voice-chip">Current voice: {selectedVoiceDescriptor || 'Unknown voice'} | Speed: {speechRate.toFixed(2)}x</p>
        </section>
      )}

      {view === 'admin' && (
        <AdminVoiceSettings
          currentVoiceId={selectedVoiceId}
          currentSpeechRate={speechRate}
          onApply={handleApplyVoice}
        />
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
                <div className="session-orb-panel">
                  <div className="session-captions-toggle-row">
                    <label className="caption-toggle" htmlFor="caption-toggle-input">
                      <span className="caption-toggle-label">Captions</span>
                      <input
                        id="caption-toggle-input"
                        type="checkbox"
                        checked={captionsEnabled}
                        onChange={(e) => handleCaptionsToggle(e.target.checked)}
                      />
                      <span className="caption-toggle-slider" aria-hidden="true" />
                    </label>
                  </div>

                  <div className="session-orb-container">
                    <SpeechIndicatorOrb
                      audioElement={tts.currentAudio}
                      isPlaying={tts.isPlaying}
                      spokenText={tts.currentText}
                      wordTimings={tts.currentWordTimings}
                      captionsEnabled={captionsEnabled}
                    />
                  </div>
                </div>

                <div className="session-voice-output">
                  <div className="session-voice-controls">
                    <button
                      className="btn-primary"
                      onClick={() => tts.speak(playbackText, selectedVoiceId, speechRate)}
                      disabled={!playbackText || tts.isPlaying}
                      title={playbackButtonTitle}
                    >
                      {tts.isPlaying ? 'Playing...' : playbackButtonLabel}
                    </button>
                    {state.status === 'ongoing' && (
                      <button
                        className="btn-secondary"
                        onClick={handleDemoSkip}
                        disabled={state.isLoading}
                        title="Skip counselling and move to practice generation"
                      >
                        Demo Skip
                      </button>
                    )}
                  </div>
                  <VoiceControls
                    stt={stt}
                    onTranscriptReady={handleTranscriptReady}
                    disabled={state.isLoading || state.status === 'finalizing'}
                    embedded
                    buttonsOnly
                  />
                </div>

                {planReady && (
                  <section className="fade-in">
                    <GameTab
                      plan={state.plan}
                      onGoHome={handleGoHome}
                      tts={tts}
                      stt={stt}
                      selectedVoiceId={selectedVoiceId}
                      speechRate={speechRate}
                      onActivePromptChange={setActivePracticePrompt}
                      voiceInput={practiceVoiceInput}
                      onVoiceInputConsumed={handlePracticeVoiceInputConsumed}
                    />
                  </section>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </Layout>
  );
}
