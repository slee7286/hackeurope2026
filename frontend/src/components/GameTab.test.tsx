import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameTab } from './GameTab';
import type { TherapySessionPlan } from '../api/sessionClient';
import type { UseSpeechToTextResult } from '../hooks/useSpeechToText';
import type { UseTextToSpeechResult } from '../hooks/useTextToSpeech';

const useTherapyEngineMock = vi.fn();

vi.mock('../hooks/useTherapyEngine', () => ({
  useTherapyEngine: () => useTherapyEngineMock(),
}));

const plan: TherapySessionPlan = {
  patientProfile: {
    mood: 'motivated',
    interests: ['travel'],
    difficulty: 'easy',
    notes: 'none',
  },
  sessionMetadata: {
    sessionId: 'session-1',
    createdAt: '2026-02-21T00:00:00.000Z',
    estimatedDurationMinutes: 15,
  },
  therapyBlocks: [
    {
      blockId: 'block-1',
      type: 'word_repetition',
      topic: 'daily life',
      difficulty: 'easy',
      description: 'repeat words',
      items: [
        {
          prompt: 'Say hello',
          answer: 'hello',
        },
      ],
    },
  ],
};

const twoSectionPlan: TherapySessionPlan = {
  ...plan,
  therapyBlocks: [
    plan.therapyBlocks[0],
    {
      blockId: 'block-2',
      type: 'sentence_completion',
      topic: 'travel',
      difficulty: 'easy',
      description: 'complete sentence',
      items: [
        {
          prompt: 'I will go to the ___',
          answer: 'airport',
        },
      ],
    },
  ],
};

function makeStt(overrides: Partial<UseSpeechToTextResult> = {}): UseSpeechToTextResult {
  return {
    isRecording: false,
    isTranscribing: false,
    transcript: '',
    error: null,
    startRecording: vi.fn(async () => {}),
    stopRecording: vi.fn(),
    clearTranscript: vi.fn(),
    ...overrides,
  };
}

function makeTts(overrides: Partial<UseTextToSpeechResult> = {}): UseTextToSpeechResult {
  return {
    isPlaying: overrides.isPlaying ?? false,
    error: overrides.error ?? null,
    currentAudio: overrides.currentAudio ?? null,
    currentText: overrides.currentText ?? null,
    currentWordTimings: overrides.currentWordTimings ?? [],
    speak: overrides.speak ?? vi.fn(async () => {}),
    stop: overrides.stop ?? vi.fn(),
  };
}

beforeEach(() => {
  useTherapyEngineMock.mockReturnValue({
    status: 'presenting',
    plan,
    blockIndex: 0,
    itemIndex: 0,
    score: { correct: 0, total: 0 },
    feedback: null,
    error: null,
    loadPlan: vi.fn(),
    start: vi.fn(),
    submitAnswer: vi.fn(),
    skipItem: vi.fn(),
    skipSection: vi.fn(),
    next: vi.fn(),
    end: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GameTab voice handoff flow', () => {
  it('shows no textbox initially and prompts to use orb controls', () => {
    render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    expect(screen.queryByLabelText('Answer input')).not.toBeInTheDocument();
    expect(screen.getByText('Use Hold to Talk.')).toBeInTheDocument();
  });

  it('loads answer from voiceInput and marks it consumed', () => {
    const onVoiceInputConsumed = vi.fn();
    const { rerender } = render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
        voiceInput=""
        onVoiceInputConsumed={onVoiceInputConsumed}
      />
    );

    rerender(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
        voiceInput="hello there"
        onVoiceInputConsumed={onVoiceInputConsumed}
      />
    );

    expect(screen.getByLabelText('Answer input')).toHaveValue('hello there');
    expect(onVoiceInputConsumed).toHaveBeenCalledTimes(1);
  });

  it('submits edited voice answer on confirm', () => {
    const submitAnswer = vi.fn();
    useTherapyEngineMock.mockReturnValue({
      status: 'presenting',
      plan,
      blockIndex: 0,
      itemIndex: 0,
      score: { correct: 0, total: 0 },
      feedback: null,
      error: null,
      loadPlan: vi.fn(),
      start: vi.fn(),
      submitAnswer,
      skipItem: vi.fn(),
      skipSection: vi.fn(),
      next: vi.fn(),
      end: vi.fn(),
    });

    render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
        voiceInput="helo"
        onVoiceInputConsumed={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Answer input');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(submitAnswer).toHaveBeenCalledWith('hello');
  });
});

describe('GameTab prompt and summary flow', () => {
  it('reports the active prompt for orb playback', async () => {
    const onActivePromptChange = vi.fn();
    render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
        onActivePromptChange={onActivePromptChange}
      />
    );

    await waitFor(() => expect(onActivePromptChange).toHaveBeenCalledWith('Say hello'));
  });

  it('keeps practice summary at the bottom of the practice panel', () => {
    render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    const summary = screen.getByText('View practice summary (optional)');
    const answerLabel = screen.getByText('Your answer');
    const relation = answerLabel.compareDocumentPosition(summary);
    expect((relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it('starts with summary collapsed and reveals details when opened', () => {
    render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    const difficultyText = screen.getByText('Difficulty: easy');
    expect(difficultyText).not.toBeVisible();
    fireEvent.click(screen.getByText('View practice summary (optional)'));
    expect(difficultyText).toBeVisible();
  });

  it('auto-starts practice when a loaded plan is provided', async () => {
    const start = vi.fn();
    useTherapyEngineMock.mockReturnValue({
      status: 'loaded',
      plan,
      blockIndex: 0,
      itemIndex: 0,
      score: { correct: 0, total: 0 },
      feedback: null,
      error: null,
      loadPlan: vi.fn(),
      start,
      submitAnswer: vi.fn(),
      skipItem: vi.fn(),
      skipSection: vi.fn(),
      next: vi.fn(),
      end: vi.fn(),
    });

    render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });
});

describe('GameTab controls', () => {
  it('triggers question skip and stops audio when Demo Skip is pressed', () => {
    const skipItem = vi.fn();
    const stop = vi.fn();

    useTherapyEngineMock.mockReturnValue({
      status: 'presenting',
      plan: twoSectionPlan,
      blockIndex: 0,
      itemIndex: 0,
      score: { correct: 0, total: 0 },
      feedback: null,
      error: null,
      loadPlan: vi.fn(),
      start: vi.fn(),
      submitAnswer: vi.fn(),
      skipItem,
      skipSection: vi.fn(),
      next: vi.fn(),
      end: vi.fn(),
    });

    render(
      <GameTab
        plan={twoSectionPlan}
        onGoHome={vi.fn()}
        tts={makeTts({ stop })}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Demo Skip' }));
    expect(skipItem).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not render an End session button during practice', () => {
    render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    expect(screen.queryByRole('button', { name: 'End session' })).not.toBeInTheDocument();
  });
});
