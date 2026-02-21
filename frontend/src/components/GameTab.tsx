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

interface GameTabProps {
  plan: TherapySessionPlan | null;
  onGoHome: () => void;
  tts: UseTextToSpeechResult;
  stt: UseSpeechToTextResult;
  selectedVoiceId: string;
}

function makePlaceholderImage(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#eef3f5"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="72" fill="#20323a">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildPlaceholderChoices(): PictureChoice[] {
  const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
  return labels.map((label, idx) => ({
    id: label,
    imageUrl: makePlaceholderImage(`Option ${label}`),
    isCorrect: idx === 0,
  }));
}

export function GameTab({ plan, onGoHome, tts, stt, selectedVoiceId }: GameTabProps) {
  const engine = useTherapyEngine();
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showPromptText, setShowPromptText] = useState(false);

  const [imageChoices, setImageChoices] = useState<PictureChoice[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [lastPictureFeedback, setLastPictureFeedback] = useState<{
    selectedId: string;
    correctId: string;
    isCorrect: boolean;
  } | null>(null);

  const lastAutoPlayedRef = useRef<string | null>(null);
  const speakRef = useRef(tts.speak);
  speakRef.current = tts.speak;

  useEffect(() => {
    if (plan) engine.loadPlan(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  useEffect(() => {
    if (engine.status === 'presenting') {
      setAnswer('');
      setSubmitted(false);
      setShowPromptText(false);
      setImageChoices([]);
      setImagesLoading(false);
      setSelectedChoiceId(null);
      setLastPictureFeedback(null);
    }
  }, [engine.status, engine.blockIndex, engine.itemIndex]);

  useEffect(() => {
    if (engine.status !== 'presenting' || !engine.plan) return;
    const key = `${engine.blockIndex}-${engine.itemIndex}`;
    if (lastAutoPlayedRef.current === key) return;
    const block = engine.plan.therapyBlocks[engine.blockIndex];
    const item = block?.items[engine.itemIndex];
    if (!item) return;
    lastAutoPlayedRef.current = key;
    speakRef.current(item.prompt, selectedVoiceId);
  }, [engine.status, engine.blockIndex, engine.itemIndex, engine.plan, selectedVoiceId]);

  useEffect(() => {
    if (stt.transcript) {
      setAnswer(stt.transcript);
      stt.clearTranscript();
    }
  }, [stt.transcript, stt.clearTranscript]);

  useEffect(() => {
    if (engine.status !== 'presenting' || !engine.plan) return;
    const block = engine.plan.therapyBlocks[engine.blockIndex];
    const item = block?.items[engine.itemIndex];
    if (!block || !item || block.type !== 'picture_description') return;

    let cancelled = false;
    setImagesLoading(true);
    setImageChoices([]);

    fetchPictureChoices(item.answer, block.topic)
      .then((choices) => {
        if (cancelled) return;
        setImageChoices(choices.length > 0 ? choices : buildPlaceholderChoices());
        setImagesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setImageChoices(buildPlaceholderChoices());
        setImagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [engine.status, engine.blockIndex, engine.itemIndex, engine.plan]);

  const handlePlayPrompt = useCallback(() => {
    if (!engine.plan) return;
    const block = engine.plan.therapyBlocks[engine.blockIndex];
    const item = block?.items[engine.itemIndex];
    if (item) tts.speak(item.prompt, selectedVoiceId);
  }, [engine.plan, engine.blockIndex, engine.itemIndex, tts, selectedVoiceId]);

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

  const handlePictureSelect = useCallback((choiceId: string) => {
    if (submitted) return;
    setSelectedChoiceId(choiceId);
  }, [submitted]);

  const handlePictureSubmit = useCallback(() => {
    if (!engine.plan || !selectedChoiceId || submitted) return;
    const block = engine.plan.therapyBlocks[engine.blockIndex];
    const item = block?.items[engine.itemIndex];
    if (!item) return;

    const selected = imageChoices.find((choice) => choice.id === selectedChoiceId);
    const correct = imageChoices.find((choice) => choice.isCorrect);
    if (!selected || !correct) return;

    setSubmitted(true);
    tts.stop();

    const planExpectsLabel = /^[A-D]$/i.test(item.answer.trim());
    const submittedAnswer = planExpectsLabel
      ? selected.id
      : selected.isCorrect
        ? item.answer
        : selected.id;

    setLastPictureFeedback({
      selectedId: selected.id,
      correctId: correct.id,
      isCorrect: selected.isCorrect,
    });

    engine.submitAnswer(submittedAnswer);
  }, [engine, imageChoices, selectedChoiceId, submitted, tts]);

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

  if (engine.status === 'loaded' && engine.plan) {
    const p = engine.plan;
    const totalItems = p.therapyBlocks.reduce((sum, b) => sum + b.items.length, 0);
    return (
      <div className="surface-panel fade-in">
        <h2 className="panel-title">Session plan ready</h2>
        <div className="game-plan-meta">
          <span>{p.therapyBlocks.length} exercises</span>
          <span aria-hidden="true">.</span>
          <span>{totalItems} prompts</span>
          <span aria-hidden="true">.</span>
          <span>Difficulty: {p.patientProfile.difficulty}</span>
          <span aria-hidden="true">.</span>
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
        <div className="game-progress-row">
          <span className="game-block-badge">
            {BLOCK_TYPE_LABELS[block.type] ?? block.type}
          </span>
          <span className="game-progress-text">
            {completedItems + 1} of {totalItems}
          </span>
        </div>

        <div className="game-topic-row">{block.topic}</div>

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

        {isPictureBlock ? (
          <div className="game-answer-section">
            <div className="game-section-label">Select the correct picture</div>

            {imagesLoading && (
              <div className="game-notice">Loading images, please wait...</div>
            )}

            {!imagesLoading && imageChoices.length === 0 && (
              <div className="game-notice">Preparing image options...</div>
            )}

            {imageChoices.length > 0 && (
              <>
                <div className="game-picture-grid">
                  {imageChoices.map((choice) => (
                    <button
                      key={choice.id}
                      className={[
                        'game-picture-choice',
                        selectedChoiceId === choice.id ? 'game-picture-choice--selected' : '',
                      ].join(' ').trim()}
                      onClick={() => handlePictureSelect(choice.id)}
                      disabled={submitted}
                      aria-label={`Select option ${choice.id}`}
                    >
                      <span className="game-picture-option-badge">{choice.id}</span>
                      <img
                        src={choice.imageUrl}
                        alt={`Option ${choice.id}`}
                        className="game-picture-img"
                      />
                    </button>
                  ))}
                </div>
                <div className="game-input-row">
                  <button
                    className="btn-primary"
                    onClick={handlePictureSubmit}
                    disabled={!selectedChoiceId || submitted}
                  >
                    Submit selection
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="game-answer-section">
            <div className="game-section-label">Your answer</div>

            <div className="game-stt-controls">
              {!stt.isRecording ? (
                <button
                  className="btn-secondary game-record-btn"
                  onClick={() => stt.startRecording()}
                  disabled={controlsDisabled}
                  aria-label="Start recording spoken answer"
                >
                  Record Answer
                </button>
              ) : (
                <button
                  className="btn-secondary game-record-btn game-record-btn--active"
                  onClick={() => stt.stopRecording()}
                  aria-label="Stop recording"
                >
                  Stop Recording
                </button>
              )}
              {stt.isRecording && (
                <span className="game-recording-indicator" aria-live="assertive">
                  <span className="game-recording-dot" aria-hidden="true" />
                  Recording...
                </span>
              )}
            </div>

            {stt.error && (
              <div className="game-notice game-notice--error" role="alert">
                {stt.error}
              </div>
            )}

            <div className="game-input-row">
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type or speak your answer"
                disabled={submitted || stt.isRecording}
                autoFocus
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
          </div>
        )}

        <button className="btn-ghost game-end-early-btn" onClick={engine.end}>
          End session
        </button>
      </div>
    );
  }

  if (engine.status === 'showingFeedback' && engine.feedback) {
    const { isCorrect, expected, submitted: sub } = engine.feedback;
    const pictureFeedbackText = lastPictureFeedback
      ? lastPictureFeedback.isCorrect
        ? `Correct. You chose ${lastPictureFeedback.selectedId}.`
        : `Incorrect. You chose ${lastPictureFeedback.selectedId}; correct was ${lastPictureFeedback.correctId}.`
      : null;

    return (
      <div className="surface-panel fade-in game-feedback-panel">
        <div
          className="game-feedback-mark"
          style={{ color: isCorrect ? 'var(--color-correct)' : 'var(--color-danger)' }}
          aria-label={isCorrect ? 'Correct' : 'Incorrect'}
        >
          {isCorrect ? 'OK' : 'X'}
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
        {pictureFeedbackText && (
          <div className="game-feedback-detail">
            <span>{pictureFeedbackText}</span>
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
