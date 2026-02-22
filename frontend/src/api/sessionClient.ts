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

export type SessionStatus = 'ongoing' | 'finalizing' | 'completed';

const MIN_PRACTICE_QUESTIONS = 4;
const MAX_PRACTICE_QUESTIONS = 50;

function normalisePracticeQuestionCount(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(MAX_PRACTICE_QUESTIONS, Math.max(MIN_PRACTICE_QUESTIONS, Math.trunc(value as number)));
}

const BASE = '/api';
const STATUS_MAP: Record<string, SessionStatus> = {
  active: 'ongoing',
  finalizing: 'finalizing',
  complete: 'completed',
  error: 'completed',
};

function parseErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const error = (body as { error?: string }).error;
    const detail = (body as { detail?: string }).detail;
    if (detail) return detail;
    if (error) return error;
  }
  return `HTTP ${status}`;
}

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
    throw new Error(parseErrorMessage(res.status, body));
  }
  const data = await res.json();
  return {
    sessionId: data.sessionId,
    patientId: (data.patientId as string | undefined) ?? 'P-12345',
    message: data.message,
  };
}

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
    throw new Error(parseErrorMessage(res.status, body));
  }
  const data = await res.json();

  return {
    reply: data.message as string,
    status: STATUS_MAP[data.status as string] ?? 'ongoing',
  };
}

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
    throw new Error(parseErrorMessage(res.status, body));
  }
  const data = await res.json();

  return {
    sessionId: data.sessionId,
    patientId: (data.patientId as string | undefined) ?? 'P-12345',
    message: data.message,
    status: STATUS_MAP[data.status as string] ?? 'finalizing',
  };
}

export async function fetchPlan(sessionId: string): Promise<TherapySessionPlan> {
  const res = await fetch(`${BASE}/session/${sessionId}/plan`);
  if (res.status === 202) throw new Error('PENDING');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseErrorMessage(res.status, body));
  }
  const data = await res.json();
  return (data.plan ?? data) as TherapySessionPlan;
}

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
    throw new Error(parseErrorMessage(res.status, body));
  }

  const data = (await res.json()) as {
    choices?: PictureChoice[];
  };

  return Array.isArray(data.choices) ? data.choices : [];
}

export interface PracticeSessionMetrics {
  correct: number;
  total: number;
  blockCount: number;
  difficulty: Difficulty;
  estimatedDurationMinutes: number;
  topics: string[];
}

export interface PracticeSessionSummary {
  id: string;
  sessionId: string;
  patientId: string;
  completedAt: string;
  summary: string;
  performance: string;
  metrics: {
    correct: number;
    total: number;
    accuracyPercent: number;
    blockCount: number;
    difficulty: Difficulty;
    estimatedDurationMinutes: number;
    topics: string[];
  };
}

export interface CreatePracticeSessionSummaryRequest {
  patientId?: string;
  completedAt?: string;
  metrics: PracticeSessionMetrics;
}

export async function savePracticeSessionSummary(
  sessionId: string,
  payload: CreatePracticeSessionSummaryRequest
): Promise<PracticeSessionSummary> {
  const res = await fetch(`${BASE}/session/${sessionId}/practice-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseErrorMessage(res.status, body));
  }

  const data = (await res.json()) as { summary?: PracticeSessionSummary };
  if (!data.summary) {
    throw new Error('Practice summary response missing summary payload.');
  }

  return data.summary;
}

export async function fetchPracticeSessionHistory(
  patientId = 'P-12345',
  limit = 20
): Promise<PracticeSessionSummary[]> {
  const params = new URLSearchParams({
    patientId,
    limit: String(limit),
  });

  const res = await fetch(`${BASE}/session/history?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseErrorMessage(res.status, body));
  }

  const data = (await res.json()) as { items?: PracticeSessionSummary[] };
  return Array.isArray(data.items) ? data.items : [];
}
