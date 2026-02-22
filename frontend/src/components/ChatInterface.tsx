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
  speechRate: number;
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
        {plan.sessionMetadata.estimatedDurationMinutes} min | {plan.therapyBlocks.length} exercises
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
  speechRate,
}: ChatInterfaceProps) {
  const [inputText, setInputText] = useState('');
  const [hasVoiceDraft, setHasVoiceDraft] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Tracks the index of the last AI message that was auto-played.
  // Prevents replaying the same message if the component re-renders for other reasons.
  const lastAutoPlayedIndexRef = useRef<number>(-1);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-play the latest AI message whenever a new one arrives.
  useEffect(() => {
    let lastAiIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'ai') { lastAiIndex = i; break; }
    }
    if (lastAiIndex === -1 || lastAiIndex === lastAutoPlayedIndexRef.current) return;
    lastAutoPlayedIndexRef.current = lastAiIndex;
    tts.speak(messages[lastAiIndex].text, selectedVoiceId, speechRate);
  }, [messages, tts, selectedVoiceId, speechRate]);

  useEffect(() => {
    if (voiceInput) {
      setInputText(voiceInput);
      setHasVoiceDraft(true);
      onVoiceInputConsumed();
    }
  }, [voiceInput, onVoiceInputConsumed]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;
    setInputText('');
    setHasVoiceDraft(false);
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
        <StatusBadge status={status} />

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
                    onClick={() => tts.speak(msg.text, selectedVoiceId, speechRate)}
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
        {hasVoiceDraft ? (
          <>
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
                    : 'Review your transcript'
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
              Confirm
            </button>
          </>
        ) : (
          <div
            style={{
              color: 'var(--color-text-muted)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              padding: '8px 2px',
            }}
            role="status"
          >
            Press and hold to talk.
          </div>
        )}
      </div>
    </div>
  );
}
