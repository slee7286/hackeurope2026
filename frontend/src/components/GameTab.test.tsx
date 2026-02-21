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
    skipSection: vi.fn(),
    next: vi.fn(),
    end: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('GameTab audio-first input flow', () => {
  it('does not show textbox on initial load', () => {
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
    expect(screen.getByRole('button', { name: 'Press and hold to record spoken answer' })).toBeInTheDocument();
  });

  it('rejects short tap and shows hint', () => {
    vi.useFakeTimers();

    const startRecording = vi.fn(async () => {});
    const stopRecording = vi.fn();

    const { rerender } = render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt({ startRecording, stopRecording })}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    const recordButton = screen.getByRole('button', { name: 'Press and hold to record spoken answer' });
    fireEvent.mouseDown(recordButton);

    rerender(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt({ isRecording: true, startRecording, stopRecording })}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    vi.advanceTimersByTime(100);
    fireEvent.mouseUp(screen.getByRole('button', { name: 'Press and hold to record spoken answer' }));

    expect(stopRecording).toHaveBeenCalledWith({ discard: true });
    expect(screen.getByText('Press and hold to talk.')).toBeInTheDocument();
  });

  it('valid hold triggers transcription', () => {
    vi.useFakeTimers();

    const startRecording = vi.fn(async () => {});
    const stopRecording = vi.fn();

    const { rerender } = render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt({ startRecording, stopRecording })}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Press and hold to record spoken answer' }));

    rerender(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt({ isRecording: true, startRecording, stopRecording })}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    vi.advanceTimersByTime(500);
    fireEvent.mouseUp(screen.getByRole('button', { name: 'Press and hold to record spoken answer' }));

    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(stopRecording).toHaveBeenCalledWith({ discard: false });
  });

  it('shows textbox with transcript after successful transcription', () => {
    const clearTranscript = vi.fn();

    const { rerender } = render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    rerender(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt({ transcript: 'hello there', clearTranscript })}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    expect(screen.getByLabelText('Answer input')).toHaveValue('hello there');
    expect(clearTranscript).toHaveBeenCalledTimes(1);
  });

  it('submits edited transcript text on confirm', () => {
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
      skipSection: vi.fn(),
      next: vi.fn(),
      end: vi.fn(),
    });

    const { rerender } = render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt()}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    rerender(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt({ transcript: 'helo' })}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    const input = screen.getByLabelText('Answer input');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(submitAnswer).toHaveBeenCalledWith('hello');
  });

  it('re-record replaces previous transcript text', () => {
    vi.useFakeTimers();

    const startRecording = vi.fn(async () => {});
    const stopRecording = vi.fn();

    const { rerender } = render(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt({ transcript: 'first try', startRecording, stopRecording })}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    expect(screen.getByLabelText('Answer input')).toHaveValue('first try');

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Press and hold to record spoken answer' }));

    rerender(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt({ isRecording: true, transcript: 'first try', startRecording, stopRecording })}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    vi.advanceTimersByTime(500);
    fireEvent.mouseUp(screen.getByRole('button', { name: 'Press and hold to record spoken answer' }));

    rerender(
      <GameTab
        plan={plan}
        onGoHome={vi.fn()}
        tts={makeTts()}
        stt={makeStt({ transcript: 'second try', startRecording, stopRecording })}
        selectedVoiceId="voice-1"
        speechRate={0.8}
      />
    );

    expect(stopRecording).toHaveBeenCalledWith({ discard: false });
    expect(screen.getByLabelText('Answer input')).toHaveValue('second try');
  });
});

describe('GameTab plan handoff flow', () => {
  it('starts with practice summary hidden and reveals it from dropdown', () => {
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

  it('auto-starts practice when plan is loaded', async () => {
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
    expect(screen.queryByRole('button', { name: 'Begin practice' })).not.toBeInTheDocument();
  });
});

describe('GameTab demo skip flow', () => {
  it('triggers section skip and stops audio when Demo Skip is pressed', () => {
    const skipSection = vi.fn();
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
      skipSection,
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
    expect(skipSection).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
