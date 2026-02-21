import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../hooks/useSession';
import type { FullStatus } from '../hooks/useSession';
import type { TherapySessionPlan } from '../api/sessionClient';
import type { UseTextToSpeechResult } from '../hooks/useTextToSpeech';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  status: FullStatus;
  plan: TherapySessionPlan | null;
  isLoading: boolean;
  onSend: (text: string) => void;
  voiceInput: string;
  onVoiceInputConsumed: () => void;
  tts: UseTextToSpeechResult;
  selectedVoiceId: string;
}

function StatusBadge({ status }: { status: FullStatus }) {
  const configs: Partial<Record<FullStatus, { label: string; color: string; bg: string }>> = {
    ongoing: { label: 'In session', color: '#245263', bg: '#e5f0f4' },
    finalizing: { label: 'Generating your plan...', color: '#7d5a1f', bg: '#fff2d0' },
    completed: { label: 'Session complete. Plan ready.', color: '#355842', bg: '#e8f4ed' },
  };

  const cfg = configs[status];
  if (!cfg) return null;

  return (
    <div
      className="fade-in"
      style={{
        background: cfg.bg,
        color: cfg.color,
        borderRadius: 'var(--radius-sm)',
        padding: '7px 14px',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        marginBottom: '6px',
        alignSelf: 'flex-start',
      }}
    >
      {cfg.label}
    </div>
  );
}

function PlanSummary({ plan }: { plan: TherapySessionPlan }) {
  const topics = [...new Set(plan.therapyBlocks.map((b) => b.topic))];

  return (
    <div
      className="fade-in"
      style={{
        background: 'var(--color-surface-alt)',
        border: '1.5px solid var(--color-accent-rose)',
        borderRadius: 'var(--radius)',
        padding: '16px 20px',
        margin: '6px 0',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 'var(--font-size-lg)',
          marginBottom: '6px',
          color: 'var(--color-primary)',
        }}
      >
        Today's session plan
      </div>
      <div
        style={{
          color: 'var(--color-text-muted)',
          fontSize: 'var(--font-size-sm)',
          marginBottom: '10px',
        }}
      >
        {plan.sessionMetadata.estimatedDurationMinutes} min | {plan.therapyBlocks.length} exercises | Difficulty:{' '}
        {plan.patientProfile.difficulty}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {topics.map((topic) => (
          <span
            key={topic}
            style={{
              background: 'var(--color-primary)',
              color: '#fff',
              borderRadius: '99px',
              padding: '4px 13px',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              textTransform: 'capitalize',
            }}
          >
            {topic}
          </span>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="fade-in" style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: 700,
          color: '#fff',
          flexShrink: 0,
        }}
      >
        AI
      </div>
      <div
        style={{
          background: 'var(--color-ai-bubble)',
          borderRadius: '4px 16px 16px 16px',
          padding: '14px 18px',
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'var(--color-primary)',
              animation: 'bounce 1.1s ease infinite',
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

type OrbPhase = 'idle' | 'speaking' | 'paused';

function SpeechIndicatorOrb({
  audioElement,
  isPlaying,
}: {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
}) {
  const [phase, setPhase] = useState<OrbPhase>('idle');
  const orbCoreRef = useRef<HTMLDivElement>(null);
  const orbHaloRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const lastIsPlayingRef = useRef(false);
  const phaseRef = useRef<OrbPhase>('idle');
  const smoothedLevelRef = useRef(0);
  const lastReactiveLevelRef = useRef(0.15);
  const releaseStartedAtRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<{
    source: MediaElementAudioSourceNode;
    analyser: AnalyserNode;
    data: Uint8Array<ArrayBuffer>;
  } | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (audioNodesRef.current) {
      audioNodesRef.current.source.disconnect();
      audioNodesRef.current.analyser.disconnect();
      audioNodesRef.current = null;
    }

    if (!audioElement) return;

    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) return;

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;

    try {
      const source = context.createMediaElementSource(audioElement);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;

      source.connect(analyser);
      analyser.connect(context.destination);

      audioNodesRef.current = {
        source,
        analyser,
        data: new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>,
      };
    } catch {
      audioNodesRef.current = null;
    }

    if (context.state === 'suspended') {
      void context.resume().catch(() => {
        // Ignore autoplay policy errors; visualizer will recover after user interaction.
      });
    }

    return () => {
      if (audioNodesRef.current) {
        audioNodesRef.current.source.disconnect();
        audioNodesRef.current.analyser.disconnect();
        audioNodesRef.current = null;
      }
    };
  }, [audioElement]);

  useEffect(() => {
    const animate = (timestamp: number) => {
      const playing = isPlayingRef.current;

      if (playing && audioContextRef.current?.state === 'suspended') {
        void audioContextRef.current.resume().catch(() => {
          // Ignore autoplay policy errors; visualizer will recover after user interaction.
        });
      }

      if (lastIsPlayingRef.current && !playing) {
        releaseStartedAtRef.current = timestamp;
        lastReactiveLevelRef.current = Math.max(lastReactiveLevelRef.current, smoothedLevelRef.current, 0.12);
      } else if (!lastIsPlayingRef.current && playing) {
        releaseStartedAtRef.current = null;
      }
      lastIsPlayingRef.current = playing;

      let amplitude = 0;
      const nodes = audioNodesRef.current;
      if (playing && nodes) {
        nodes.analyser.getByteTimeDomainData(nodes.data);
        let sum = 0;
        for (let i = 0; i < nodes.data.length; i += 1) {
          const centered = (nodes.data[i] - 128) / 128;
          sum += centered * centered;
        }
        amplitude = Math.sqrt(sum / nodes.data.length);
      }

      const normalized = Math.min(1, Math.max(0, (amplitude - 0.012) * 5.2));
      smoothedLevelRef.current = smoothedLevelRef.current * 0.84 + normalized * 0.16;

      const idlePulse = 0.08 + 0.025 * Math.sin(timestamp * 0.0027);
      let nextPhase: OrbPhase = 'idle';
      let level = idlePulse;

      if (playing) {
        nextPhase = 'speaking';
        const reactiveLevel = Math.max(smoothedLevelRef.current, idlePulse * 0.75);
        level = reactiveLevel;
        lastReactiveLevelRef.current = reactiveLevel;
      } else if (releaseStartedAtRef.current !== null) {
        nextPhase = 'paused';
        const progress = Math.min((timestamp - releaseStartedAtRef.current) / 450, 1);
        const eased = 1 - (1 - progress) * (1 - progress);
        level = lastReactiveLevelRef.current * (1 - eased) + idlePulse * eased;
        if (progress >= 1) {
          releaseStartedAtRef.current = null;
          nextPhase = 'idle';
        }
      }

      if (nextPhase !== phaseRef.current) {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
      }

      const core = orbCoreRef.current;
      const halo = orbHaloRef.current;
      if (core) {
        const scale = 1 + level * 0.55;
        const glow = 10 + level * 44;
        const glowOpacity =
          nextPhase === 'speaking'
            ? 0.24 + level * 0.48
            : nextPhase === 'paused'
              ? 0.18 + level * 0.28
              : 0.12 + level * 0.2;
        core.style.transform = `scale(${scale.toFixed(3)})`;
        core.style.opacity = `${(0.84 + Math.min(level * 0.25, 0.16)).toFixed(3)}`;
        core.style.boxShadow = `0 0 ${glow.toFixed(1)}px rgba(93, 129, 143, ${glowOpacity.toFixed(
          3
        )}), inset 0 0 ${(4 + level * 16).toFixed(1)}px rgba(255, 255, 255, 0.55)`;
      }
      if (halo) {
        const haloScale = 1.05 + level * 0.85;
        const haloOpacity = nextPhase === 'speaking' ? 0.35 + level * 0.35 : 0.18 + level * 0.22;
        halo.style.transform = `scale(${haloScale.toFixed(3)})`;
        halo.style.opacity = haloOpacity.toFixed(3);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (audioNodesRef.current) {
        audioNodesRef.current.source.disconnect();
        audioNodesRef.current.analyser.disconnect();
        audioNodesRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {
          // Ignore close errors on teardown.
        });
        audioContextRef.current = null;
      }
    };
  }, []);

  const phaseLabel = phase === 'speaking' ? 'Speaking' : phase === 'paused' ? 'Stopping' : 'Idle';

  return (
    <div
      style={{
        minWidth: 124,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 10px',
        borderRadius: '14px',
        border: '1px solid var(--color-border)',
        background: 'rgba(255, 255, 255, 0.82)',
        backdropFilter: 'blur(4px)',
      }}
      aria-live="polite"
    >
      <div
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div
          ref={orbHaloRef}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '999px',
            background: 'radial-gradient(circle, rgba(93, 129, 143, 0.35), rgba(93, 129, 143, 0))',
            transform: 'scale(1)',
            opacity: 0.2,
            transition: 'opacity 120ms linear',
          }}
        />
        <div
          ref={orbCoreRef}
          style={{
            width: 16,
            height: 16,
            borderRadius: '999px',
            background:
              'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.88), rgba(93, 129, 143, 0.95) 70%, rgba(74, 105, 116, 0.95))',
            transform: 'scale(1)',
            opacity: 0.88,
            willChange: 'transform, box-shadow, opacity',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.03em' }}>Voice</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary)' }}>{phaseLabel}</span>
      </div>
    </div>
  );
}

export function ChatInterface({
  messages,
  status,
  plan,
  isLoading,
  onSend,
  voiceInput,
  onVoiceInputConsumed,
  tts,
  selectedVoiceId,
}: ChatInterfaceProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (voiceInput) {
      setInputText(voiceInput);
      onVoiceInputConsumed();
    }
  }, [voiceInput, onVoiceInputConsumed]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;
    setInputText('');
    onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputDisabled = isLoading || status === 'completed' || status === 'idle' || status === 'starting';

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '420px',
        maxHeight: '62vh',
        overflow: 'hidden',
      }}
    >
      <div
        className="chat-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
          <StatusBadge status={status} />
          <SpeechIndicatorOrb audioElement={tts.currentAudio} isPlaying={tts.isPlaying} />
        </div>

        {messages.map((msg, i) => (
          <div
            key={i}
            className="fade-in"
            style={{
              display: 'flex',
              flexDirection: msg.role === 'ai' ? 'row' : 'row-reverse',
              alignItems: 'flex-end',
              gap: '8px',
            }}
          >
            {msg.role === 'ai' && (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                AI
              </div>
            )}

            <div
              style={{
                maxWidth: '70%',
                background: msg.role === 'ai' ? 'var(--color-ai-bubble)' : 'var(--color-patient-bubble)',
                borderRadius: msg.role === 'ai' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                padding: '12px 16px',
                fontSize: 'var(--font-size-base)',
                lineHeight: 1.55,
                color: 'var(--color-text)',
              }}
            >
              {msg.text}

              {msg.role === 'ai' && (
                <div style={{ marginTop: '8px' }}>
                  <button
                    onClick={() => tts.speak(msg.text, selectedVoiceId)}
                    disabled={tts.isPlaying}
                    title="Play reply again"
                    style={{
                      background: 'transparent',
                      color: 'var(--color-primary)',
                      fontSize: '13px',
                      fontWeight: 600,
                      padding: '3px 9px',
                      border: '1.5px solid var(--color-primary)',
                      borderRadius: '6px',
                      lineHeight: 1,
                    }}
                  >
                    Play reply
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && <TypingIndicator />}

        {plan && <PlanSummary plan={plan} />}

        <div ref={messagesEndRef} />
      </div>

      <div
        style={{
          borderTop: '2px solid var(--color-border)',
          padding: '12px 16px',
          display: 'flex',
          gap: '10px',
          background: 'var(--color-surface)',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            status === 'completed'
              ? 'Session complete.'
              : status === 'idle' || status === 'starting'
                ? 'Start a session first...'
                : 'Type your answer...'
          }
          disabled={inputDisabled}
          style={{ flex: 1 }}
          aria-label="Message input"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || inputDisabled}
          style={{
            background: 'var(--color-primary)',
            color: '#fff',
            padding: '0.6em 1.5em',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
