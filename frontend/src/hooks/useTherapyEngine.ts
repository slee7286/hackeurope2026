import { useState, useCallback } from 'react';
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

/** Case-insensitive, punctuation-stripped normalisation for comparison. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Aphasia-lenient evaluation:
 * - Exact match after normalisation
 * - Submitted is contained in expected (patient gave partial correct phrase)
 * - Expected is contained in submitted (patient gave a longer correct phrase)
 */
function evaluate(submitted: string, expected: string): boolean {
  const s = normalise(submitted);
  const e = normalise(expected);
  if (!s) return false;
  return s === e || e.includes(s) || s.includes(e);
}

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
    setState((prev) => {
      // Guard: only accept submissions in presenting state
      if (prev.status !== 'presenting' || !prev.plan) return prev;
      const block = prev.plan.therapyBlocks[prev.blockIndex];
      const item = block?.items[prev.itemIndex];
      if (!item) return { ...prev, status: 'error', error: 'Item not found.' };
      const isCorrect = evaluate(text, item.answer);
      return {
        ...prev,
        status: 'showingFeedback',
        score: {
          correct: prev.score.correct + (isCorrect ? 1 : 0),
          total: prev.score.total + 1,
        },
        feedback: { isCorrect, expected: item.answer, submitted: text },
      };
    });
  }, []);

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
