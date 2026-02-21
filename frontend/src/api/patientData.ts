// ─── Patient summary (dummy data) ─────────────────────────────────────────────
// Replace with a real backend call when patient history is implemented.

export interface SkillSummary {
  name: string;
  stars: number; // 1–3
}

export interface PatientSummary {
  totalSessions: number;
  lastSessionDate: string;
  streakDays: number;
  skills: SkillSummary[];
}

export function getPatientSummary(): PatientSummary {
  return {
    totalSessions: 12,
    lastSessionDate: '2026-02-20',
    streakDays: 5,
    skills: [
      { name: 'Words', stars: 3 },
      { name: 'Sentences', stars: 2 },
      { name: 'Conversation', stars: 1 },
    ],
  };
}
