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
  /** picture_description only — 3 noun labels used to fetch Bing distractor images. */
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

// ─── API base URL ─────────────────────────────────────────────────────────────
// Vite proxies /api → http://localhost:3001 (see vite.config.ts)
const BASE = '/api';

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Start a new check-in session.
 * Returns the sessionId, patientId (mocked if not yet in backend), and
 * Claude's first greeting message.
 */
export async function startSession(): Promise<{
  sessionId: string;
  patientId: string;
  message: string;
}> {
  const res = await fetch(`${BASE}/session/start`, { method: 'POST' });
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

  const statusMap: Record<string, SessionStatus> = {
    active: 'ongoing',
    finalizing: 'finalizing',
    complete: 'completed',
    error: 'completed',
  };

  return {
    reply: data.message as string,   // backend calls the field "message"
    status: statusMap[data.status as string] ?? 'ongoing',
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
  query: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  isCorrect: boolean;
}

/**
 * Fetch one image per label (correct + distractors) from the backend Bing proxy.
 * Returns the choices shuffled so the correct image is not always first.
 */
export async function fetchPictureChoices(
  correctQuery: string,
  distractorQueries: string[]
): Promise<PictureChoice[]> {
  const allQueries = [correctQuery, ...distractorQueries];
  const params = new URLSearchParams();
  allQueries.forEach((q) => params.append('query', q));
  const res = await fetch(`${BASE}/image-search?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Image search failed (${res.status})`
    );
  }
  const data = await res.json() as {
    results: Array<{ query: string; url: string; thumbnailUrl: string; title: string }>;
  };
  const images: PictureChoice[] = data.results.map((r) => ({
    ...r,
    isCorrect: r.query === correctQuery,
  }));
  // Fisher-Yates shuffle so the correct image is not always in position 0
  for (let i = images.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [images[i], images[j]] = [images[j], images[i]];
  }
  return images;
}
