import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminVoiceSettings } from './AdminVoiceSettings';

interface VoiceEntry {
  language: string;
  language_id: string;
  dialect: string;
  accent: string;
  accent_description: string;
  voice_id: string;
}

interface VoicesPayload {
  source: string;
  model: {
    id: string;
    name: string;
  };
  voices: VoiceEntry[];
}

const standardPayload: VoicesPayload = {
  source: 'standard',
  model: {
    id: 'eleven_multilingual_v2',
    name: 'Eleven Multilingual v2',
  },
  voices: [
    {
      language: 'English',
      language_id: 'en',
      dialect: 'en-US',
      accent: 'american',
      accent_description: 'General American',
      voice_id: 'std-voice-1',
    },
  ],
};

const customPayload: VoicesPayload = {
  source: 'custom',
  model: {
    id: 'custom',
    name: 'Custom Voices',
  },
  voices: [
    {
      language: 'English',
      language_id: 'en',
      dialect: 'custom-en',
      accent: 'custom',
      accent_description: 'brother',
      voice_id: 'X12PW7Yyha7jBtX7TvA7',
    },
  ],
};

function makeResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('AdminVoiceSettings', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockImplementation(async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === '/api/tts/voices') {
        return makeResponse(standardPayload);
      }

      if (url === '/api/tts/voices/custom') {
        return makeResponse(customPayload);
      }

      return makeResponse({ error: 'Not found' }, 404);
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('loads both Standard and Custom tabs', async () => {
    render(
      <AdminVoiceSettings
        currentVoiceId="std-voice-1"
        currentSpeechRate={0.85}
        currentPracticeQuestionCount={10}
        onApply={vi.fn()}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('tab', { name: 'Standard' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Custom' })).toBeInTheDocument();
  });

  it('applies a custom voice when the Custom tab is selected', async () => {
    const onApply = vi.fn();

    render(
      <AdminVoiceSettings
        currentVoiceId="std-voice-1"
        currentSpeechRate={0.85}
        currentPracticeQuestionCount={10}
        onApply={onApply}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Custom voice') as HTMLSelectElement).value).toBe('X12PW7Yyha7jBtX7TvA7'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));

    expect(onApply).toHaveBeenCalledWith('X12PW7Yyha7jBtX7TvA7', 0.85, 'brother', 10);
  });

  it('opens on the Custom tab when the current voice is custom', async () => {
    render(
      <AdminVoiceSettings
        currentVoiceId="X12PW7Yyha7jBtX7TvA7"
        currentSpeechRate={0.85}
        currentPracticeQuestionCount={10}
        onApply={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Custom' })).toHaveAttribute('aria-selected', 'true'),
    );
  });
});
