// ─── Therapy Block Types ──────────────────────────────────────────────────────

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
}

export interface TherapyBlock {
  blockId: string;
  type: BlockType;
  topic: string;
  difficulty: Difficulty;
  description: string;
  items: TherapyItem[];
}

// ─── Session Plan ─────────────────────────────────────────────────────────────

export interface PatientProfile {
  mood: Mood;
  interests: string[];
  difficulty: Difficulty;
  notes: string;
}

export interface SessionMetadata {
  sessionId: string;
  createdAt: string; // ISO 8601
  estimatedDurationMinutes: number;
}

export interface TherapySessionPlan {
  patientProfile: PatientProfile;
  sessionMetadata: SessionMetadata;
  therapyBlocks: TherapyBlock[];
}

// ─── Conversation State ───────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface ConversationMessage {
  role: MessageRole;
  content: string;
}

export type SessionStatus =
  | "active"      // check-in conversation in progress
  | "finalizing"  // finalize_session tool was called, plan generation running
  | "complete"    // TherapySessionPlan is ready
  | "error";      // unrecoverable error

export interface SessionState {
  sessionId: string;
  createdAt: string;
  status: SessionStatus;
  history: ConversationMessage[];
  plan: TherapySessionPlan | null;
  error: string | null;
}

// ─── API Request / Response Shapes ───────────────────────────────────────────

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

// ─── Tool Use ─────────────────────────────────────────────────────────────────

/** Shape of the arguments Claude supplies when calling finalize_session */
export interface FinalizeSessionArgs {
  mood: Mood;
  interests: string[];
  difficulty: Difficulty;
  notes: string;
  estimatedDurationMinutes: number;
}
