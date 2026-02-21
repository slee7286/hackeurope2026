import { useState, useCallback, useRef } from 'react';
import {
  startSession,
  sendMessage,
  fetchPlan,
  type TherapySessionPlan,
  type SessionStatus,
} from '../api/sessionClient';

export interface ChatMessage {
  role: 'ai' | 'patient';
  text: string;
}

export type FullStatus = SessionStatus | 'idle' | 'starting';

export interface SessionState {
  sessionId: string | null;
  patientId: string;
  messages: ChatMessage[];
  status: FullStatus;
  plan: TherapySessionPlan | null;
  error: string | null;
  isLoading: boolean;
}

export function useSession() {
  const [state, setState] = useState<SessionState>({
    sessionId: null,
    patientId: 'P-12345',
    messages: [],
    status: 'idle',
    plan: null,
    error: null,
    isLoading: false,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPollingForPlan = useCallback(
    (sessionId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const plan = await fetchPlan(sessionId);
          stopPolling();
          setState((prev) => ({ ...prev, plan, status: 'completed' }));
        } catch (err) {
          // 'PENDING' is the expected error while the plan is still generating
          if (err instanceof Error && err.message !== 'PENDING') {
            stopPolling();
            setState((prev) => ({
              ...prev,
              error: 'Could not load your plan. Please refresh.',
              status: 'completed',
            }));
          }
        }
      }, 2000);
    },
    [stopPolling]
  );

  /** Start a fresh session. Fetches Claude's greeting and sets sessionId. */
  const start = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      status: 'starting',
      messages: [],
      plan: null,
    }));
    try {
      const { sessionId, patientId, message } = await startSession();
      setState((prev) => ({
        ...prev,
        sessionId,
        patientId,
        messages: [{ role: 'ai', text: message }],
        status: 'ongoing',
        isLoading: false,
      }));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        error: `Could not connect: ${detail}`,
        status: 'idle',
        isLoading: false,
      }));
    }
  }, []);

  /** Send a patient message. Appends both the patient turn and AI reply. */
  const send = useCallback(
    async (text: string) => {
      if (!state.sessionId || !text.trim()) return;
      const sessionId = state.sessionId;

      // Optimistically append the patient message
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, { role: 'patient', text }],
        isLoading: true,
        error: null,
      }));

      try {
        const { reply, status } = await sendMessage(sessionId, text);
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, { role: 'ai', text: reply }],
          status,
          isLoading: false,
        }));

        if (status === 'finalizing') {
          startPollingForPlan(sessionId);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          error: `Could not send message: ${detail}`,
          isLoading: false,
        }));
      }
    },
    [state.sessionId, startPollingForPlan]
  );

  return { state, start, send };
}
