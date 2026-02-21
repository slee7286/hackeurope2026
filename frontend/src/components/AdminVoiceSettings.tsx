import React, { useEffect, useMemo, useState } from 'react';

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

interface AdminVoiceSettingsProps {
  currentVoiceId: string;
  onApply: (voiceId: string) => void;
}

export function AdminVoiceSettings({ currentVoiceId, onApply }: AdminVoiceSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<VoicesPayload | null>(null);
  const [dialect, setDialect] = useState('');

  useEffect(() => {
    let alive = true;

    const fetchVoices = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/tts/voices');
        if (!response.ok) {
          throw new Error(`Could not load voice options (${response.status}).`);
        }

        const nextPayload = (await response.json()) as VoicesPayload;
        if (!alive) {
          return;
        }

        setPayload(nextPayload);

        const exactMatch = nextPayload.voices.find((voice) => voice.voice_id === currentVoiceId);
        const fallback = nextPayload.voices[0];
        const initial = exactMatch ?? fallback;

        if (initial) {
          setDialect(initial.dialect);
        }
      } catch (err) {
        if (!alive) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Could not load voice options.');
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    fetchVoices();

    return () => {
      alive = false;
    };
  }, [currentVoiceId]);

  const dialectOptions = useMemo(() => {
    return payload?.voices ?? [];
  }, [payload]);

  const selectedEntry = useMemo(() => {
    return dialectOptions.find((voice) => voice.dialect === dialect) ?? null;
  }, [dialectOptions, dialect]);

  const onDialectChange = (nextDialect: string) => {
    setDialect(nextDialect);
  };
  const applyDisabled = !selectedEntry?.voice_id?.trim();

  return (
    <section className="surface-panel fade-in admin-panel">
      <h2 className="panel-title">Admin voice settings</h2>
      <p className="panel-copy">
        Choose a language and dialect from the configured ElevenLabs list. The selected voice ID will be used for
        conversation TTS.
      </p>

      {loading && <div className="session-loading">Loading voice options...</div>}

      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && payload && (
        <div className="admin-form">
          <label className="admin-field">
            <span>Dialect</span>
            <select value={dialect} onChange={(event) => onDialectChange(event.target.value)}>
              {dialectOptions.map((option) => (
                <option key={option.dialect} value={option.dialect}>
                  {option.accent_description}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-field">
            <span>Language</span>
            <div className="admin-readonly">{selectedEntry?.language ?? 'N/A'}</div>
          </div>

          <div className="admin-field">
            <span>Description</span>
            <div className="admin-readonly">{selectedEntry?.accent_description ?? 'N/A'}</div>
          </div>

          <div className="admin-field">
            <span>Voice ID</span>
            <div className="admin-readonly">{selectedEntry?.voice_id ?? 'N/A'}</div>
          </div>

          <div className="admin-actions">
            <button
              className="btn-primary"
              onClick={() => selectedEntry && onApply(selectedEntry.voice_id.trim())}
              disabled={applyDisabled}
            >
              Apply voice
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
