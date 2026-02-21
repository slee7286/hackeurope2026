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
  currentSpeechRate: number;
  onApply: (voiceId: string, speechRate: number) => void;
}

type AbilityLevel = 'needs_support' | 'balanced' | 'independent';

const ABILITY_SPEED_PRESETS: Array<{
  level: AbilityLevel;
  label: string;
  description: string;
  speechRate: number;
}> = [
  {
    level: 'needs_support',
    label: 'Needs more support',
    description: 'Slower speech for easier following and repetition.',
    speechRate: 0.7,
  },
  {
    level: 'balanced',
    label: 'Balanced',
    description: 'Standard practice pace for most users.',
    speechRate: 0.85,
  },
  {
    level: 'independent',
    label: 'More independent',
    description: 'Slightly faster pace for higher ability users.',
    speechRate: 1,
  },
];

function getClosestAbilityLevel(speechRate: number): AbilityLevel {
  let closest = ABILITY_SPEED_PRESETS[0];
  let minDistance = Math.abs(speechRate - closest.speechRate);

  for (const preset of ABILITY_SPEED_PRESETS.slice(1)) {
    const distance = Math.abs(speechRate - preset.speechRate);
    if (distance < minDistance) {
      closest = preset;
      minDistance = distance;
    }
  }

  return closest.level;
}

export function AdminVoiceSettings({ currentVoiceId, currentSpeechRate, onApply }: AdminVoiceSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<VoicesPayload | null>(null);
  const [dialect, setDialect] = useState('');
  const [abilityLevel, setAbilityLevel] = useState<AbilityLevel>(
    getClosestAbilityLevel(currentSpeechRate),
  );

  useEffect(() => {
    setAbilityLevel(getClosestAbilityLevel(currentSpeechRate));
  }, [currentSpeechRate]);

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

  const selectedAbilityPreset = useMemo(() => {
    return (
      ABILITY_SPEED_PRESETS.find((preset) => preset.level === abilityLevel) ??
      ABILITY_SPEED_PRESETS[1]
    );
  }, [abilityLevel]);

  const onDialectChange = (nextDialect: string) => {
    setDialect(nextDialect);
  };
  const applyDisabled = !selectedEntry?.voice_id?.trim();

  return (
    <section className="surface-panel fade-in admin-panel">
      <h2 className="panel-title">Admin voice settings</h2>
      <p className="panel-copy">
        Choose a language and dialect from the configured ElevenLabs list. The selected voice ID will be used for
        conversation TTS. Use ability level to slightly adjust speaking speed.
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

          <label className="admin-field">
            <span>User ability</span>
            <select
              value={abilityLevel}
              onChange={(event) => setAbilityLevel(event.target.value as AbilityLevel)}
            >
              {ABILITY_SPEED_PRESETS.map((preset) => (
                <option key={preset.level} value={preset.level}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-actions">
            <button
              className="btn-primary"
              onClick={() =>
                selectedEntry && onApply(selectedEntry.voice_id.trim(), selectedAbilityPreset.speechRate)
              }
              disabled={applyDisabled}
            >
              Apply settings
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
