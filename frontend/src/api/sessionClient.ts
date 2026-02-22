// ─── Types (mirrors src/types.ts on the backend) ─────────────────────────────
// Share these with the game/therapy engine team as the contract.

export type BlockType =
  | 'word_repetition'
  | 'sentence_completion'
  | 'picture_description'
  | 'word_finding';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Mood = 'happy' | 'tired' | 'anxious' | 'motivated' | 'frustrated' | 'calm';

export interface TherapyItem {
  prompt: string;
  answer: string;
  /** picture_description optional decoy hints for image retrieval. */
  distractors?: string[];
}

export interface TherapyBlock {
  blockId: string;
  type: BlockType;
  topic: string;
  difficulty: Difficulty;
  description: string;
  items: TherapyItem[];
}

export interface TherapySessionPlan {
  patientProfile: {
    mood: Mood;
    interests: string[];
    difficulty: Difficulty;
    notes: string;
  };
  sessionMetadata: {
    sessionId: string;
    createdAt: string;
    estimatedDurationMinutes: number;
  };
  therapyBlocks: TherapyBlock[];
}

// Frontend-facing status values (mapped from backend)
export type SessionStatus = 'ongoing' | 'finalizing' | 'completed';

const MIN_PRACTICE_QUESTIONS = 4;
const MAX_PRACTICE_QUESTIONS = 50;

function normalisePracticeQuestionCount(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(MAX_PRACTICE_QUESTIONS, Math.max(MIN_PRACTICE_QUESTIONS, Math.trunc(value as number)));
}

// ─── API base URL ─────────────────────────────────────────────────────────────
// Vite proxies /api → http://localhost:3001 (see vite.config.ts)
const BASE = '/api';
const STATUS_MAP: Record<string, SessionStatus> = {
  active: 'ongoing',
  finalizing: 'finalizing',
  complete: 'completed',
  error: 'completed',
};

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Start a new check-in session.
 * Returns the sessionId, patientId (mocked if not yet in backend), and
 * Claude's first greeting message.
 */
export async function startSession(practiceQuestionCount?: number): Promise<{
  sessionId: string;
  patientId: string;
  message: string;
}> {
  const nextPracticeQuestionCount = normalisePracticeQuestionCount(practiceQuestionCount);
  const res = await fetch(`${BASE}/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      nextPracticeQuestionCount === undefined ? {} : { practiceQuestionCount: nextPracticeQuestionCount },
    ),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string; detail?: string }).detail ?? (body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  return {
    sessionId: data.sessionId,
    // patientId is not yet returned by the backend — placeholder until added
    patientId: (data.patientId as string | undefined) ?? 'P-12345',
    message: data.message,
  };
}

/**
 * Send a patient message and get Claude's reply.
 * Maps backend's status values to frontend-friendly ones:
 *   active     → ongoing
 *   finalizing → finalizing
 *   complete   → completed
 *   error      → completed (surface error via reply text)
 */
export async function sendMessage(
  sessionId: string,
  message: string
): Promise<{ reply: string; status: SessionStatus }> {
  const res = await fetch(`${BASE}/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string; detail?: string }).detail ?? (body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();

  return {
    reply: data.message as string,   // backend calls the field "message"
    status: STATUS_MAP[data.status as string] ?? 'ongoing',
  };
}

/**
 * Start a demo session that skips counselling and auto-fills required profile
 * info before plan generation.
 */
export async function startDemoSkipSession(practiceQuestionCount?: number): Promise<{
  sessionId: string;
  patientId: string;
  message: string;
  status: SessionStatus;
}> {
  const nextPracticeQuestionCount = normalisePracticeQuestionCount(practiceQuestionCount);
  const res = await fetch(`${BASE}/session/demo-skip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      nextPracticeQuestionCount === undefined ? {} : { practiceQuestionCount: nextPracticeQuestionCount },
    ),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string; detail?: string }).detail ?? (body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();

  return {
    sessionId: data.sessionId,
    patientId: (data.patientId as string | undefined) ?? 'P-12345',
    message: data.message,
    status: STATUS_MAP[data.status as string] ?? 'finalizing',
  };
}

/**
 * Poll for the generated TherapySessionPlan.
 * Throws 'PENDING' if the plan is not yet ready (HTTP 202).
 * Use this in a polling loop (e.g., every 2 seconds).
 */
export async function fetchPlan(sessionId: string): Promise<TherapySessionPlan> {
  const res = await fetch(`${BASE}/session/${sessionId}/plan`);
  if (res.status === 202) throw new Error('PENDING');
  if (!res.ok) {
    // Read the error detail from the response body so the UI can show it
    const body = await res.json().catch(() => ({}));
    const detail = (body as { detail?: string; error?: string }).detail
      ?? (body as { error?: string }).error
      ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }
  const data = await res.json();
  // Backend wraps the plan in { plan: ... }
  return (data.plan ?? data) as TherapySessionPlan;
}

// ─── Picture Description image choices ────────────────────────────────────────

export interface PictureChoice {
  id: 'A' | 'B' | 'C' | 'D';
  imageUrl: string;
  isCorrect: boolean;
}

export interface PictureImage {
  imageUrl: string;
}

export async function fetchPictureChoices(targetConcept: string, topic?: string): Promise<PictureChoice[]> {
  const params = new URLSearchParams({
    targetConcept,
  });
  if (topic?.trim()) params.set('topic', topic.trim());

  const res = await fetch(`${BASE}/picture-images?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Picture image fetch failed (${res.status})`
    );
  }

  const data = (await res.json()) as {
    choices?: PictureChoice[];
  };

  return Array.isArray(data.choices) ? data.choices : [];
}
