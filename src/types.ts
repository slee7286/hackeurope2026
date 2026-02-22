export type BlockType =
  | "word_repetition"
  | "sentence_completion"
  | "picture_description"
  | "word_finding";

export type Difficulty = "easy" | "medium" | "hard";

export type Mood =
  | "happy"
  | "tired"
  | "anxious"
  | "motivated"
  | "frustrated"
  | "calm";

export interface TherapyItem {
  prompt: string;
  answer: string;
  // Optional alternative labels that can help image retrieval for picture_description.
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

export interface PatientProfile {
  mood: Mood;
  interests: string[];
  difficulty: Difficulty;
  notes: string;
}

export interface SessionMetadata {
  sessionId: string;
  createdAt: string;
  estimatedDurationMinutes: number;
}

// ─── Session Summary Types (check-in enrichment) ──────────────────────────────

/** Numeric ratings captured during the therapeutic check-in. */
export interface ScalingRatings {
  mood_rating: number;
  stress_rating: number;
  other_scales?: Record<string, number>;
}

/** Safety flag populated if the patient expressed acute distress or risk. */
export interface SafetyConcerns {
  has_acute_risk: boolean;
  notes: string;
}

/** A CBT/reflective practice question generated from session themes. */
export interface PracticeQuestion {
  question_id: string;
  question_text: string;
  category: "reflection" | "behavioral_experiment" | "values" | "coping_skills";
  related_theme: string;
}

/**
 * Richer narrative summary of the check-in conversation.
 * Populated from the enhanced finalize_session tool fields and
 * from the practice questions generated during plan creation.
 */
export interface SessionSummary {
  main_themes: string[];
  emotional_tone: string[];
  scaling: ScalingRatings;
  strengths_and_resources: string[];
  challenges: string[];
  goals: string[];
  safety_concerns: SafetyConcerns;
  user_quotes: string[];
  practice_questions: PracticeQuestion[];
}

// ─── Therapy Session Plan ─────────────────────────────────────────────────────

export interface TherapySessionPlan {
  patientProfile: PatientProfile;
  sessionMetadata: SessionMetadata;
  therapyBlocks: TherapyBlock[];
  /** Richer check-in summary. Present when the enhanced check-in flow is used. */
  sessionSummary?: SessionSummary;
}

// ─── Conversation Types ───────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface ConversationMessage {
  role: MessageRole;
  content: string;
}

export type SessionStatus = "active" | "finalizing" | "complete" | "error";

export interface SessionState {
  sessionId: string;
  createdAt: string;
  status: SessionStatus;
  history: ConversationMessage[];
  plan: TherapySessionPlan | null;
  practiceQuestionCount?: number;
  error: string | null;
}

// ─── API Contract Types ───────────────────────────────────────────────────────

export interface StartSessionResponse {
  sessionId: string;
  message: string;
  status: SessionStatus;
}

export interface SendMessageRequest {
  message: string;
}

export interface SendMessageResponse {
  message: string;
  status: SessionStatus;
  planReady: boolean;
}

export interface GetPlanResponse {
  plan: TherapySessionPlan;
}

/**
 * Arguments passed to the finalize_session tool by Claude.
 *
 * Core fields (required): collected in every check-in.
 * Enhanced fields (optional): populated when the richer 5-phase check-in
 *   flow is used; used to build SessionSummary in the plan.
 */
export interface FinalizeSessionArgs {
  // --- Core fields (required) ---
  mood: Mood;
  interests: string[];
  difficulty: Difficulty;
  notes: string;
  estimatedDurationMinutes: number;

  // --- Enhanced check-in fields (optional) ---
  /** Key topics that emerged during the check-in. */
  main_themes?: string[];
  /** Emotions the patient expressed. */
  emotional_tone?: string[];
  /** Patient's self-reported mood on a 1–10 scale. */
  mood_rating?: number;
  /** Estimated stress level on a 1–10 scale. */
  stress_rating?: number;
  /** Specific difficulties the patient mentioned. */
  challenges?: string[];
  /** Next steps or goals the patient expressed. */
  goals?: string[];
  /** True if the patient expressed hopelessness or acute risk. */
  safety_concern?: boolean;
  /** Brief note when safety_concern is true. */
  safety_notes?: string;
  /** Up to 3 short direct quotes from the patient. */
  user_quotes?: string[];
}
