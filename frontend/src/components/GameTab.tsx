import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { TherapySessionPlan, PictureChoice } from '../api/sessionClient';
import { fetchPictureChoices } from '../api/sessionClient';
import type { UseTextToSpeechResult } from '../hooks/useTextToSpeech';
import type { UseSpeechToTextResult } from '../hooks/useSpeechToText';
import { useTherapyEngine } from '../hooks/useTherapyEngine';

const BLOCK_TYPE_LABELS: Record<string, string> = {
  word_repetition: 'Word Repetition',
  sentence_completion: 'Sentence Completion',
  picture_description: 'Picture Description',
  word_finding: 'Word Finding',
};
const PRACTICE_RATE_FACTOR = 0.9;

const MIN_HOLD_DURATION_MS = 150;

interface GameTabProps {
  plan: TherapySessionPlan | null;
  onGoHome: () => void;
  tts: UseTextToSpeechResult;
  stt: UseSpeechToTextResult;
  selectedVoiceId: string;
  speechRate: number;
}

export function GameTab({ plan, onGoHome, tts, stt, selectedVoiceId, speechRate }: GameTabProps) {
  const engine = useTherapyEngine();
  const practiceSpeechRate = Math.max(0.7, Math.min(1.2, speechRate * PRACTICE_RATE_FACTOR));
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showPromptText, setShowPromptText] = useState(false);
  const [hasTranscript, setHasTranscript] = useState(false);
  const [holdHint, setHoldHint] = useState<string | null>(null);

  // Picture description state
  const [imageChoices, setImageChoices] = useState<PictureChoice[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);

  // Track the last item auto-played so TTS fires exactly once per new prompt.
  // We use a ref rather than state to avoid triggering re-renders.
  const lastAutoPlayedRef = useRef<string | null>(null);

  // Keep a ref to tts.speak so the auto-play effect doesn't need it as a dep
  // (the speak function is stable, but the tts object reference changes on re-render).
  const speakRef = useRef(tts.speak);
  speakRef.current = tts.speak;

  // Tracks hold-to-talk start time to reject accidental short taps.
  const holdStartTimeRef = useRef<number | null>(null);

  // Plan loading
  useEffect(() => {
    if (plan) engine.loadPlan(plan);
    // engine.loadPlan is stable (empty useCallback deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  // Per-item reset
  // Clear the answer input, prompt visibility, and image state whenever a new item is shown.
  useEffect(() => {
    if (engine.status === 'presenting') {
      setAnswer('');
      setSubmitted(false);
      setShowPromptText(false);
      setImageChoices([]);
      setHasTranscript(false);
      setHoldHint(null);
      holdStartTimeRef.current = null;
    }
  }, [engine.status, engine.blockIndex, engine.itemIndex]);

  // Auto-play TTS
  // Speak the prompt once when a new item arrives.
  // Guard with a ref key to prevent double-firing on re-renders.
  useEffect(() => {
    if (engine.status !== 'presenting' || !engine.plan) return;
    const key = `${engine.blockIndex}-${engine.itemIndex}`;
    if (lastAutoPlayedRef.current === key) return;
    const block = engine.plan.therapyBlocks[engine.blockIndex];
    const item = block?.items[engine.itemIndex];
    if (!item) return;
    lastAutoPlayedRef.current = key;
    speakRef.current(item.prompt, selectedVoiceId, practiceSpeechRate);
  }, [engine.status, engine.blockIndex, engine.itemIndex, engine.plan, selectedVoiceId, practiceSpeechRate]);

  // STT transcript -> answer input
  useEffect(() => {
    if (stt.transcript) {
      setAnswer(stt.transcript);
      setHasTranscript(true);
      setHoldHint(null);
      stt.clearTranscript();
    }
  }, [stt.transcript, stt.clearTranscript]);

  // Picture choices fetch
  useEffect(() => {
    if (engine.status !== 'presenting' || !engine.plan) return;
    const block = engine.plan.therapyBlocks[engine.blockIndex];
    const item = block?.items[engine.itemIndex];
    if (!block || !item || block.type !== 'picture_description') return;
    if (!item.distractors?.length) return;

    let cancelled = false;
    setImagesLoading(true);
    setImagesError(null);

    fetchPictureChoices(item.answer, item.distractors)
      .then((choices) => {
        if (!cancelled) {
          setImageChoices(choices);
          setImagesLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setImagesError(
            (err instanceof Error ? err.message : null) ?? 'Failed to load images.'
          );
          setImagesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [engine.status, engine.blockIndex, engine.itemIndex, engine.plan]);

  const handleRecordMouseDown = useCallback(async () => {
    if (submitted || stt.isRecording || stt.isTranscribing) return;
    setHoldHint(null);
    holdStartTimeRef.current = Date.now();
    await stt.startRecording();
  }, [submitted, stt]);

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

  // Handlers
  const handlePlayPrompt = useCallback(() => {
    if (!engine.plan) return;
    const block = engine.plan.therapyBlocks[engine.blockIndex];
    const item = block?.items[engine.itemIndex];
    if (item) tts.speak(item.prompt, selectedVoiceId, practiceSpeechRate);
  }, [engine.plan, engine.blockIndex, engine.itemIndex, tts, selectedVoiceId, practiceSpeechRate]);

  const handleSubmit = useCallback(() => {
    if (!answer.trim() || submitted) return;
    setSubmitted(true);
    tts.stop();
    engine.submitAnswer(answer.trim());
  }, [answer, submitted, engine, tts]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handlePictureClick = useCallback(
    (choice: PictureChoice) => {
      if (submitted) return;
      setSubmitted(true);
      tts.stop();
      // choice.query matches item.answer for correct, distractor label for wrong
      engine.submitAnswer(choice.query);
    },
    [submitted, engine, tts]
  );

  // Idle
  if (engine.status === 'idle') {
    return (
      <div className="surface-panel fade-in game-empty">
        <h2 className="panel-title">No session plan</h2>
        <p className="panel-copy" style={{ marginTop: 8 }}>
          Complete a check-in session to receive a personalised therapy plan before
          starting practice.
        </p>
        <button className="btn-primary" style={{ marginTop: 20 }} onClick={onGoHome}>
          Go to check-in
        </button>
      </div>
    );
  }

  // Error
  if (engine.status === 'error') {
    return (
      <div className="surface-panel fade-in game-empty">
        <p style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
          {engine.error ?? 'An unexpected error occurred.'}
        </p>
        <button className="btn-secondary" style={{ marginTop: 12 }} onClick={onGoHome}>
          Return to check-in
        </button>
      </div>
    );
  }

  // Loaded
  if (engine.status === 'loaded' && engine.plan) {
    const p = engine.plan;
    const totalItems = p.therapyBlocks.reduce((sum, b) => sum + b.items.length, 0);
    return (
      <div className="surface-panel fade-in">
        <h2 className="panel-title">Session plan ready</h2>
        <div className="game-plan-meta">
          <span>{p.therapyBlocks.length} exercises</span>
          <span aria-hidden="true">·</span>
          <span>{totalItems} prompts</span>
          <span aria-hidden="true">·</span>
          <span>~{p.sessionMetadata.estimatedDurationMinutes} min</span>
        </div>
        <div className="game-block-list">
          {p.therapyBlocks.map((b) => (
            <div key={b.blockId} className="game-block-preview">
              <span className="game-block-badge">
                {BLOCK_TYPE_LABELS[b.type] ?? b.type}
              </span>
              <span className="game-block-topic">{b.topic}</span>
            </div>
          ))}
        </div>
        <button
          className="btn-primary"
          style={{ marginTop: 24, fontSize: 'var(--font-size-lg)' }}
          onClick={engine.start}
        >
          Begin Practice
        </button>
      </div>
    );
  }

  // Presenting
  if (engine.status === 'presenting' && engine.plan) {
    const block = engine.plan.therapyBlocks[engine.blockIndex];
    const item = block?.items[engine.itemIndex];
    if (!block || !item) return null;

    const totalItems = engine.plan.therapyBlocks.reduce((sum, b) => sum + b.items.length, 0);
    const completedItems =
      engine.plan.therapyBlocks
        .slice(0, engine.blockIndex)
        .reduce((sum, b) => sum + b.items.length, 0) + engine.itemIndex;

    const controlsDisabled = submitted;
    const isPictureBlock = block.type === 'picture_description';

    return (
      <div className="surface-panel fade-in game-present">
        {/* Progress header */}
        <div className="game-progress-row">
          <span className="game-block-badge">
            {BLOCK_TYPE_LABELS[block.type] ?? block.type}
          </span>
          <span className="game-progress-text">
            {completedItems + 1} of {totalItems}
          </span>
        </div>

        <div className="game-topic-row">{block.topic}</div>

        {/* Prompt audio section */}
        <div className="game-audio-section">
          <div className="game-section-label">Prompt</div>
          <div className="game-audio-controls">
            <button
              className="btn-primary game-audio-btn"
              onClick={handlePlayPrompt}
              disabled={tts.isPlaying || controlsDisabled}
              aria-label={tts.isPlaying ? 'Playing prompt audio' : 'Play prompt audio'}
            >
              {tts.isPlaying ? 'Playing...' : 'Play Prompt'}
            </button>
            <button
              className="btn-ghost"
              onClick={() => setShowPromptText((v) => !v)}
              aria-pressed={showPromptText}
              aria-label={showPromptText ? 'Hide prompt text' : 'Show prompt text'}
            >
              {showPromptText ? 'Hide Text' : 'Show Text'}
            </button>
          </div>
          {showPromptText && (
            <div className="game-prompt-text fade-in" aria-live="polite">
              {item.prompt}
            </div>
          )}
          {tts.error && (
            <div className="game-notice game-notice--error" role="alert">
              Audio unavailable: {tts.error}
            </div>
          )}
        </div>

        {/* Answer section - picture grid for picture_description, STT+text otherwise */}
        {isPictureBlock ? (
          <div className="game-answer-section">
            <div className="game-section-label">Select the correct picture</div>

            {imagesLoading && (
              <div className="game-notice">Loading images, please wait...</div>
            )}

            {imagesError && (
              <>
                <div className="game-notice game-notice--error" role="alert">
                  Could not load images. Please type your answer.
                </div>
                <div className="game-input-row">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your answer"
                    disabled={submitted}
                    className="game-answer-input"
                    aria-label="Answer input"
                  />
                  <button
                    className="btn-primary"
                    onClick={handleSubmit}
                    disabled={!answer.trim() || submitted}
                  >
                    Submit
                  </button>
                </div>
              </>
            )}

            {!imagesLoading && !imagesError && imageChoices.length === 0 && (
              // No distractors in plan or fetch returned empty - fall back to text
              <div className="game-input-row">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your answer"
                  disabled={submitted}
                  className="game-answer-input"
                  aria-label="Answer input"
                />
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={!answer.trim() || submitted}
                >
                  Submit
                </button>
              </div>
            )}

            {imageChoices.length > 0 && (
              <div className="game-picture-grid">
                {imageChoices.map((choice) => (
                  <button
                    key={choice.query}
                    className="game-picture-choice"
                    onClick={() => handlePictureClick(choice)}
                    disabled={submitted}
                    aria-label={`Select picture: ${choice.query}`}
                  >
                    <img
                      src={choice.thumbnailUrl}
                      alt={choice.query}
                      className="game-picture-img"
                    />
                    <span className="game-picture-label">{choice.query}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="game-answer-section">
            <div className="game-section-label">Your answer</div>

            <div className="game-stt-controls">
              <button
                className={`btn-secondary game-record-btn${stt.isRecording ? ' game-record-btn--active' : ''}`}
                onMouseDown={handleRecordMouseDown}
                onMouseUp={handleRecordMouseUp}
                onMouseLeave={handleRecordMouseUp}
                disabled={controlsDisabled || stt.isTranscribing}
                aria-label="Press and hold to record spoken answer"
              >
                {stt.isRecording ? 'Recording...' : stt.isTranscribing ? 'Transcribing...' : 'Hold to Talk'}
              </button>

              {stt.isRecording && (
                <span className="game-recording-indicator" aria-live="assertive">
                  <span className="game-recording-dot" aria-hidden="true" />
                  Recording... release to stop.
                </span>
              )}

              {stt.isTranscribing && (
                <span className="game-recording-indicator" aria-live="polite">
                  Transcribing...
                </span>
              )}
            </div>

            {holdHint && (
              <div className="game-notice" role="status">
                {holdHint}
              </div>
            )}

            {stt.error && (
              <div className="game-notice game-notice--error" role="alert">
                {stt.error}
              </div>
            )}

            {hasTranscript && (
              <div className="game-input-row">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Review your transcript"
                  disabled={submitted || stt.isRecording || stt.isTranscribing}
                  autoFocus
                  className="game-answer-input"
                  aria-label="Answer input"
                />
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={!answer.trim() || submitted || stt.isTranscribing}
                >
                  Confirm
                </button>
              </div>
            )}
          </div>
        )}

        <button className="btn-ghost game-end-early-btn" onClick={engine.end}>
          End session
        </button>
      </div>
    );
  }

  // Feedback
  if (engine.status === 'showingFeedback' && engine.feedback) {
    const { isCorrect, expected, submitted: sub } = engine.feedback;
    return (
      <div className="surface-panel fade-in game-feedback-panel">
        <div
          className="game-feedback-mark"
          style={{ color: isCorrect ? 'var(--color-correct)' : 'var(--color-danger)' }}
          aria-label={isCorrect ? 'Correct' : 'Incorrect'}
        >
          {isCorrect ? '✓' : '✗'}
        </div>
        <div
          className="game-feedback-label"
          style={{ color: isCorrect ? 'var(--color-correct)' : 'var(--color-danger)' }}
        >
          {isCorrect ? 'Correct' : 'Incorrect'}
        </div>
        {!isCorrect && (
          <div className="game-feedback-detail">
            <span>
              Your answer: <strong>{sub}</strong>
            </span>
            <span>
              Expected: <strong>{expected}</strong>
            </span>
          </div>
        )}
        <button
          className="btn-primary"
          style={{ marginTop: 24, fontSize: 'var(--font-size-lg)' }}
          onClick={engine.next}
        >
          Continue
        </button>
      </div>
    );
  }

  // Ended
  if (engine.status === 'ended') {
    const { correct, total } = engine.score;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
      <div className="surface-panel fade-in game-end">
        <div className="game-end-heading">Session Complete</div>
        <div
          className="game-score-ring"
          aria-label={`${correct} out of ${total} correct`}
        >
          <span className="game-score-number">{correct}</span>
          <span className="game-score-denom">/ {total}</span>
        </div>
        <div className="game-score-label">{pct}% correct</div>
        <div className="game-end-actions">
          <button className="btn-primary" onClick={onGoHome}>
            Return to home
          </button>
          {engine.plan && (
            <button
              className="btn-secondary"
              onClick={() => engine.loadPlan(engine.plan!)}
            >
              Practise again
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
