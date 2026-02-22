import {
  fetchPracticeSessionHistory,
  type PracticeSessionSummary,
} from './sessionClient';

export interface SkillSummary {
  name: string;
  stars: number;
}

export interface PatientSummary {
  totalSessions: number;
  lastSessionDate: string;
  streakDays: number;
  skills: SkillSummary[];
}

export interface SessionHistoryItem {
  id: string;
  date: string;
  summary: string;
  performance: string;
  metrics: PracticeSessionSummary['metrics'];
}

export function getPatientSummary(): PatientSummary {
  return {
    totalSessions: 0,
    lastSessionDate: '-',
    streakDays: 0,
    skills: [
      { name: 'Words', stars: 0 },
      { name: 'Sentences', stars: 0 },
      { name: 'Conversation', stars: 0 },
    ],
  };
}

export async function getSessionHistory(
  patientId = 'P-12345',
  limit = 20
): Promise<SessionHistoryItem[]> {
  const items = await fetchPracticeSessionHistory(patientId, limit);

  return items.map((item) => ({
    id: item.id,
    date: item.completedAt,
    summary: item.summary,
    performance: item.performance,
    metrics: item.metrics,
  }));
}
