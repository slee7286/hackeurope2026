import { useState, useCallback, useRef } from 'react';
import type { TherapySessionPlan } from '../api/sessionClient';

export type EngineStatus =
  | 'idle'
  | 'loaded'
  | 'presenting'
  | 'showingFeedback'
  | 'ended'
  | 'error';

export interface Feedback {
  isCorrect: boolean;
  expected: string;
  submitted: string;
}

interface EngineState {
  status: EngineStatus;
  plan: TherapySessionPlan | null;
  blockIndex: number;
  itemIndex: number;
  score: { correct: number; total: number };
  feedback: Feedback | null;
  error: string | null;
}

export interface UseTherapyEngineResult {
  status: EngineStatus;
  plan: TherapySessionPlan | null;
  blockIndex: number;
  itemIndex: number;
  score: { correct: number; total: number };
  feedback: Feedback | null;
  error: string | null;
  /** Load (or reload) a plan and reset to 'loaded' state. */
  loadPlan: (plan: TherapySessionPlan) => void;
  /** Begin the session: loaded → presenting. */
  start: () => void;
  /** Submit the patient's answer: presenting → showingFeedback. Guarded against double submission. */
  submitAnswer: (text: string) => void;
  /** Advance to the next item: showingFeedback → presenting | ended. */
  next: () => void;
  /** End the session early. */
  end: () => void;
}

// ─── Local answer evaluation ──────────────────────────────────────────────────

/** Case-insensitive, punctuation-stripped normalisation for comparison. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Aphasia-lenient exact evaluation:
 * - Exact match after normalisation
 * - Submitted is contained in expected (patient gave partial correct phrase)
 * - Expected is contained in submitted (patient gave a longer correct phrase)
 */
function evaluateExact(submitted: string, expected: string): boolean {
  const s = normalise(submitted);
  const e = normalise(expected);
  if (!s) return false;
  return s === e || e.includes(s) || s.includes(e);
}

// ─── Semantic evaluation via backend ─────────────────────────────────────────

/**
 * Calls POST /api/evaluate to ask Claude Haiku whether the submitted answer
 * is semantically equivalent to the expected answer.
 *
 * Throws on network or API error so the caller can fall back to exact matching.
 */
async function evaluateSemantic(submitted: string, expected: string): Promise<boolean> {
  const res = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submitted, expected }),
  });
  if (!res.ok) throw new Error(`Evaluate API returned ${res.status}`);
  const data = await res.json() as { correct: boolean };
  return data.correct;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTherapyEngine(): UseTherapyEngineResult {
  const [state, setState] = useState<EngineState>({
    status: 'idle',
    plan: null,
    blockIndex: 0,
    itemIndex: 0,
    score: { correct: 0, total: 0 },
    feedback: null,
    error: null,
  });

  // Ref mirrors state so submitAnswer can read current values without
  // being recreated on every render (keeps the callback stable).
  const stateRef = useRef(state);
  stateRef.current = state;

  // Guards against double-submission while the async semantic call is in flight.
  const isEvaluatingRef = useRef(false);

  const loadPlan = useCallback((plan: TherapySessionPlan) => {
    setState({
      status: 'loaded',
      plan,
      blockIndex: 0,
      itemIndex: 0,
      score: { correct: 0, total: 0 },
      feedback: null,
      error: null,
    });
  }, []);

  const start = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'loaded') return prev;
      return { ...prev, status: 'presenting' };
    });
  }, []);

  const submitAnswer = useCallback((text: string) => {
    // Prevent double-submission while a semantic check is in progress.
    if (isEvaluatingRef.current) return;

    const current = stateRef.current;
    if (current.status !== 'presenting' || !current.plan) return;

    const block = current.plan.therapyBlocks[current.blockIndex];
    const item = block?.items[current.itemIndex];
    if (!item) {
      setState((prev) => ({ ...prev, status: 'error', error: 'Item not found.' }));
      return;
    }

    // Step 1 — fast exact/substring match (synchronous, no network call).
    if (evaluateExact(text, item.answer)) {
      setState((prev) => ({
        ...prev,
        status: 'showingFeedback',
        score: { correct: prev.score.correct + 1, total: prev.score.total + 1 },
        feedback: { isCorrect: true, expected: item.answer, submitted: text },
      }));
      return;
    }

    // Step 2 — semantic match via Claude (async, falls back to exact result on error).
    isEvaluatingRef.current = true;
    evaluateSemantic(text, item.answer)
      .then((isCorrect) => {
        setState((prev) => ({
          ...prev,
          status: 'showingFeedback',
          score: {
            correct: prev.score.correct + (isCorrect ? 1 : 0),
            total: prev.score.total + 1,
          },
          feedback: { isCorrect, expected: item.answer, submitted: text },
        }));
      })
      .catch(() => {
        // Claude unavailable — fall back to marking incorrect (exact already failed).
        setState((prev) => ({
          ...prev,
          status: 'showingFeedback',
          score: { correct: prev.score.correct, total: prev.score.total + 1 },
          feedback: { isCorrect: false, expected: item.answer, submitted: text },
        }));
      })
      .finally(() => {
        isEvaluatingRef.current = false;
      });
  }, []); // stable — reads live state via stateRef

  const next = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'showingFeedback' || !prev.plan) return prev;
      const block = prev.plan.therapyBlocks[prev.blockIndex];
      const nextItemIndex = prev.itemIndex + 1;

      if (nextItemIndex < block.items.length) {
        return { ...prev, status: 'presenting', itemIndex: nextItemIndex, feedback: null };
      }

      const nextBlockIndex = prev.blockIndex + 1;
      if (nextBlockIndex < prev.plan.therapyBlocks.length) {
        return {
          ...prev,
          status: 'presenting',
          blockIndex: nextBlockIndex,
          itemIndex: 0,
          feedback: null,
        };
      }

      return { ...prev, status: 'ended', feedback: null };
    });
  }, []);

  const end = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'ended' }));
  }, []);

  return {
    status: state.status,
    plan: state.plan,
    blockIndex: state.blockIndex,
    itemIndex: state.itemIndex,
    score: state.score,
    feedback: state.feedback,
    error: state.error,
    loadPlan,
    start,
    submitAnswer,
    next,
    end,
  };
}
