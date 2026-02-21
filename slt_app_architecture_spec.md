# SLT Accent-Friendly Therapy App (MVP) - Architecture Spec

Version: 0.2 (MVP)  
Date: 2026-02-21  
Audience: Engineers and AI coding agents implementing the MVP

## 1) Goal

Build a simple mobile/web app that helps speech and language therapy users (target: aphasia) practice comprehension using natural-sounding voices (ElevenLabs) and image-based multiple-choice questions grounded in fresh, user-chosen topics.

Key product premise:
- Post-stroke users can struggle to understand unfamiliar accents
- Many apps use robotic voices
- This app uses high-quality speech (ElevenLabs) and short prompts

## 2) MVP User Experience

### 2.1 Primary Flow
1. User logs in
2. App asks (spoken + on-screen): "What do you want to talk about today?"
3. User speaks their topic (max 120 seconds)
4. App transcribes speech via ElevenLabs STT and shows an editable transcript
5. User edits the text (optional) and taps Continue
6. App searches the web for relevant, recent information
7. App picks a concrete exercise target related to that topic
8. App speaks a short one-sentence prompt using ElevenLabs TTS
9. App shows 4 images (1 correct + 3 distractors)
10. User taps an image
11. App provides immediate feedback (spoken + visual)
12. Repeat for N questions or until user ends session

### 2.2 Interaction Constraints (MVP)
- Only the first step uses user speech (topic input)
- After that, user interacts by tapping images (no repeating aloud required)
- Topic audio input is capped at 120 seconds
- Languages and accents are limited to those supported by ElevenLabs
- No speech provider fallback is implemented in MVP
- No clinician dashboard, no analytics export, no medical-device features
- Safety fallbacks are minimal, but must not show broken UI

## 3) Therapy-Appropriate UX Defaults (Aphasia-friendly)
Keep these on by default:
- Short, single-instruction prompts
- Large font and tap targets
- Replay audio button for prompt
- Consistent feedback phrases (calm, non-judgemental)
- No time pressure (no countdown timers)

## 4) Content Strategy and Question Type

### 4.1 Target Types (MVP)
The system may choose targets that are visually identifiable on Wikipedia, including:
- People (athletes, actors, politicians)
- Places (cities, landmarks)
- Objects/Things (products, animals, flags, logos) only if Wikipedia has a clear representative image

Constraint:
- The correct answer must have a usable Wikipedia image.

### 4.2 Question Template (MVP)
Use a consistent structure:
- Prompt: short, one target, one instruction

Examples:
- "I found something about Garry Ringrose. Tap Garry Ringrose."
- "This topic mentions the Eiffel Tower. Tap the Eiffel Tower."
- "I read about a red panda. Tap the red panda."

Avoid:
- Multi-step prompts
- Ambiguous pronouns
- Long sentences

## 5) High-Level System Architecture

### 5.1 Components
A. Client App (Mobile/Web)
- Login UI
- Topic capture UI (microphone, max 120 seconds)
- ASR transcript confirmation + editing
- Question UI (prompt text + audio + 2x2 image grid)
- Feedback UI
- Session loop

B. Backend Orchestrator API (thin)
- Receives topic audio for transcription, then finalized topic text
- Coordinates retrieval -> question building -> image selection -> response payload
- Stores minimal session state (optional)

C. Retrieval Agent (web browsing/search)
- Searches the web based on topic
- Chooses recency window and sources agentically
- Returns a small set of candidate pages (title, snippet, url, publish date if available)

D. Question Builder
- Extracts candidate entities from retrieved pages
- Chooses a target entity that is imageable on Wikipedia
- Generates prompt text

E. Wikipedia Media Resolver
- Given entity name resolves best matching Wikipedia page
- Extracts infobox image (preferred) or lead image when safe
- Provides direct image URL

F. Distractor Selector
- Finds 3 distractors that are:
  - Same broad type/category as target (person/place/object)
  - Reasonably confusable (not identical)
  - Have valid Wikipedia images

G. ElevenLabs STT Service
- Transcribes topic audio to text
- Supports only languages available in ElevenLabs
- Returns transcript text for user confirmation/edit

H. ElevenLabs TTS Service
- Synthesizes prompt audio in admin-selected voice/accent
- Returns prompt audio URL (MVP default)

### 5.2 Data Flow (Request -> Response)
1. Client records topic audio (<= 120 seconds)
2. Client sends topic audio to Orchestrator
3. Orchestrator calls ElevenLabs STT -> transcript_text
4. Orchestrator returns transcript_text to client for confirmation/edit
5. Client sends: user_id, confirmed topic_text, preferences
6. Orchestrator calls Retrieval Agent -> sources[]
7. Orchestrator calls Question Builder -> target_entity, prompt_text
8. Orchestrator calls Wikipedia Media Resolver (target) -> target_image_url
9. Orchestrator calls Distractor Selector -> distractors[3]
10. Orchestrator calls ElevenLabs TTS -> prompt_audio_url
11. Orchestrator returns Question Payload to client

## 6) Minimal Reliability Guardrails (MVP)
Even if safety fallbacks are not a priority, the MVP must:
- Never present missing/broken images in the 2x2 grid
- If any image is missing, regenerate the question with a new target
- If STT or TTS fails, show a clear error state and allow user retry

Regeneration rule:
- Attempt up to MAX_RETRIES = 3 to build a valid 4-image question
- If still failing, return an error state: "Couldn't build a question for that topic. Try a different topic."

Speech-provider rule:
- No secondary speech provider fallback in MVP

## 7) APIs and Contracts

### 7.1 Client -> Orchestrator: Transcribe Topic
POST /api/speech/transcribe

Request:
{
  "user_id": "string",
  "audio_base64": "string",
  "mime_type": "audio/webm",
  "duration_seconds": 75,
  "language_hint": "string|null"
}

Validation:
- duration_seconds must be <= 120
- mime_type must be in an allowed list
- language/accent must be supported by ElevenLabs

Response:
{
  "transcript_text": "string",
  "detected_language": "string|null",
  "provider": "elevenlabs"
}

### 7.2 Client -> Orchestrator: Start Session
POST /api/session/start

Request:
{
  "user_id": "string",
  "topic_text": "string",
  "preferences": {
    "language": "string",
    "max_questions": 10
  }
}

Notes:
- Voice/accent is admin-configured and enforced server-side for MVP
- Client does not choose voice_id or accent_label in MVP

Response:
{
  "session_id": "string",
  "question": { ...QuestionPayload }
}

### 7.3 Orchestrator -> Client: Question Payload
{
  "question_id": "string",
  "prompt_text": "string",
  "prompt_audio_url": "string",
  "choices": [
    { "id": "A", "label": "string", "image_url": "string", "source": "wikipedia", "page_url": "string" },
    { "id": "B", "label": "string", "image_url": "string", "source": "wikipedia", "page_url": "string" },
    { "id": "C", "label": "string", "image_url": "string", "source": "wikipedia", "page_url": "string" },
    { "id": "D", "label": "string", "image_url": "string", "source": "wikipedia", "page_url": "string" }
  ],
  "correct_choice_id": "string",
  "source_summary": {
    "topic": "string",
    "sources": [
      { "title": "string", "url": "string" }
    ]
  }
}

Note:
- For MVP, you may return correct_choice_id to the client for local validation.
- For a more secure design later, keep correctness server-side.

### 7.4 Client -> Orchestrator: Submit Answer
POST /api/session/answer

Request:
{
  "session_id": "string",
  "question_id": "string",
  "selected_choice_id": "string"
}

Response:
{
  "is_correct": true,
  "feedback_text": "string",
  "feedback_audio_url": "string",
  "next_question": { ...QuestionPayload }
}

### 7.4 Orchestrator -> Client: Therapy Session Plan (Structured)
Use this contract when the backend returns a pre-built multi-block therapy plan (instead of only single-question payloads).

Response:
{
  "patientProfile": {
    "mood": "string",
    "interests": ["string"],
    "difficulty": "easy|medium|hard",
    "notes": "string"
  },
  "sessionMetadata": {
    "sessionId": "string",
    "createdAt": "ISO-8601 datetime string",
    "estimatedDurationMinutes": 15
  },
  "therapyBlocks": [
    {
      "blockId": "string",
      "type": "word_repetition|sentence_completion|picture_description|word_finding",
      "topic": "string",
      "difficulty": "easy|medium|hard",
      "description": "string",
      "items": [
        {
          "prompt": "string",
          "answer": "string"
        }
      ]
    }
  ]
}

Field rules (required):
- `therapyBlocks[].type`: one of `word_repetition`, `sentence_completion`, `picture_description`, `word_finding`
- `therapyBlocks[].items[].prompt`: the text displayed/spoken to the patient
- `therapyBlocks[].items[].answer`: expected correct response for scoring and feedback
- `therapyBlocks[].difficulty`: `easy`, `medium`, or `hard` (drives ElevenLabs pacing, hint display, and support level)
- `therapyBlocks[].topic`: subject matter used for content theming and optional voice/accent tuning

Validation minimums:
- Each block must contain at least 1 item
- `prompt` and `answer` must be non-empty strings
- Unknown `type` or `difficulty` values must fail validation

## 8) Retrieval Agent Requirements

Input:
- topic_text (user-confirmed, edited text)

Behavior:
- Decide recency window autonomously (hours/days/weeks) based on topic
- Choose reputable sources appropriate to the topic
- Return a compact set of results suitable for entity extraction

Output schema:
{
  "sources": [
    {
      "title": "string",
      "url": "string",
      "snippet": "string",
      "published_at": "string|null"
    }
  ]
}

## 9) Entity Extraction and Selection

### 9.1 Candidate Entity Generation
From sources, extract named entities:
- Person, Place, Organization, Product, Animal, Event, Object-like entities

### 9.2 Target Eligibility (must pass)
- Wikipedia page exists and matches the entity reliably
- Page has an image that can be used (infobox preferred)
- Avoid disambiguation pages

### 9.3 Target Choice Heuristic (simple)
Rank candidates by:
1. Mention frequency across sources
2. Specificity (proper noun > generic phrase)
3. Image availability on Wikipedia
4. Diversity vs previous questions (if session memory exists)

## 10) Wikipedia Media Resolver

Goal:
- Convert an entity string into canonical Wikipedia page URL and a representative image URL usable in the app

Rules (MVP):
- Prefer infobox image
- If none, use first lead image if clearly associated
- If no suitable image, return failure and let orchestrator pick another target

Return schema:
{
  "page_title": "string",
  "page_url": "string",
  "image_url": "string"
}

## 11) Distractor Selection

Goal:
- Provide 3 distractors that are plausible and image-valid

Rules (MVP):
- Same type bucket as target (person/place/object)
- Avoid near-duplicates (same exact image)
- Must have valid Wikipedia image

Generation strategies (in order):
1. Same Wikipedia category or related pages
2. Same domain list (e.g., sport/team roster pages)
3. Fallback curated lists per common domains (optional later)

If insufficient distractors found:
- Regenerate with a new target entity

## 12) ElevenLabs Speech Services

### 12.1 STT (Topic Input)
Requirements:
- Use ElevenLabs STT API for first-step topic transcription
- Accept recordings up to 120 seconds
- Support only languages provided by ElevenLabs
- Return transcript text for user confirmation/edit

MVP behavior:
- Single STT provider (ElevenLabs only)
- No fallback provider in MVP
- User can manually edit transcript before session starts

### 12.2 TTS (Prompts + Feedback)
Requirements:
- Synthesize prompt_text to audio
- Voice/accent is admin-locked for the user/session
- Use only accents/languages supported by ElevenLabs
- Return prompt_audio_url (MVP default format delivery)

MVP behavior:
- One voice profile per session
- Provide replay capability on client
- If using structured therapy blocks, pacing and delivery can be adjusted by `therapyBlocks[].difficulty`
- `therapyBlocks[].topic` may be used for optional accent/voice selection when configured
- No fallback provider in MVP

## 13) Client UI Requirements

### 13.1 Topic Capture Screen
- Microphone button
- 120-second max recording limit indicator
- Transcript in editable textbox
- Continue button

### 13.2 Question Screen
- Prompt text displayed
- Replay audio button
- 2x2 image grid with large tap targets
- Optional labels under images (recommended on by default for accessibility)

### 13.3 Feedback
- Visual indicator correct/incorrect
- Short feedback text
- Optional spoken feedback (same ElevenLabs voice)

### 13.4 Therapy Block Renderer (for structured plans)
- Render blocks sequentially from `therapyBlocks[]`
- For each item, show/play `items[].prompt`, capture response, compare with `items[].answer`
- Show block-level topic and difficulty to drive UI supports (hints, pacing, repetition prompts)

## 14) Non-Goals (Out of scope for MVP)
- Clinician dashboards and reporting
- Adaptive personalization based on scores over time
- Offline mode
- Advanced safety filters and fallback content libraries
- Regulatory/medical device compliance features
- User speech repetition and scoring
- Multi-provider speech fallback and provider failover
- Speech storage/retention policy design (owned by another stack component/team)

## 15) Success Criteria (MVP)
- User can input a topic by voice (<= 120 seconds), then correct via text
- STT and TTS run through ElevenLabs for supported languages/accents
- System generates a valid 4-choice image question consistently
- Prompt audio is natural and understandable (ElevenLabs)
- No broken images displayed
- End-to-end loop works for multiple questions in a session

## 16) Implementation Notes (Pragmatic)
- Keep orchestrator stateless where possible; store only session_id and last questions if needed
- Cache Wikipedia image resolutions per entity to reduce latency
- Log minimal diagnostics for debugging: retrieval results count, entity selection, resolver failures, speech API errors
- Speech data storage/retention is handled outside this scope by another stack area

## 17) Example Artifact Alignment
- `TherapySessionPlanExample.json` is consistent with the structured contract in section 7.4.
- Existing keys like `patientProfile`, `sessionMetadata`, `blockId`, and `description` are optional enrichments beyond the required therapy block fields listed above.

End of spec.

