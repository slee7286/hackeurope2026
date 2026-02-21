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

export interface TherapySessionPlan {
  patientProfile: PatientProfile;
  sessionMetadata: SessionMetadata;
  therapyBlocks: TherapyBlock[];
}

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
  error: string | null;
}

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

export interface FinalizeSessionArgs {
  mood: Mood;
  interests: string[];
  difficulty: Difficulty;
  notes: string;
  estimatedDurationMinutes: number;
}
