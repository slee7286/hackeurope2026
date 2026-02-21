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

export function getSessionHistory(): SessionHistoryItem[] {
  return [
    {
      id: 's-12',
      date: '2026-02-20',
      summary: 'Completed picture description and sentence completion with steady pacing.',
      performance: 'Accuracy improved to 84% with fewer prompts needed in final block.',
    },
    {
      id: 's-11',
      date: '2026-02-17',
      summary: 'Focused on word finding and short repetition drills.',
      performance: 'Strong articulation in single words; moderate support needed in sentence carryover.',
    },
    {
      id: 's-10',
      date: '2026-02-14',
      summary: 'Conversation practice around daily routines and confidence-building responses.',
      performance: 'Longer responses increased from 3 to 5 words on average.',
    },
  ];
}