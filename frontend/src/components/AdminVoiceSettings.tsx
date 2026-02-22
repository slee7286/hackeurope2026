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
  onApply: (voiceId: string, speechRate: number, descriptor: string) => void;
}

type AbilityLevel = 'needs_support' | 'balanced' | 'independent';
type VoiceCatalogType = 'standard' | 'custom';

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
  const [standardPayload, setStandardPayload] = useState<VoicesPayload | null>(null);
  const [customPayload, setCustomPayload] = useState<VoicesPayload | null>(null);
  const [voiceCatalog, setVoiceCatalog] = useState<VoiceCatalogType>('standard');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
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
        const [standardResponse, customResponse] = await Promise.all([
          fetch('/api/tts/voices'),
          fetch('/api/tts/voices/custom'),
        ]);

        if (!standardResponse.ok) {
          throw new Error(`Could not load standard voice options (${standardResponse.status}).`);
        }

        if (!customResponse.ok) {
          throw new Error(`Could not load custom voice options (${customResponse.status}).`);
        }

        const [nextStandardPayload, nextCustomPayload] = (await Promise.all([
          standardResponse.json(),
          customResponse.json(),
        ])) as [VoicesPayload, VoicesPayload];

        if (!alive) {
          return;
        }

        setStandardPayload(nextStandardPayload);
        setCustomPayload(nextCustomPayload);

        const customMatch = nextCustomPayload.voices.find((voice) => voice.voice_id === currentVoiceId);
        const standardMatch = nextStandardPayload.voices.find((voice) => voice.voice_id === currentVoiceId);

        if (customMatch) {
          setVoiceCatalog('custom');
          setSelectedVoiceId(customMatch.voice_id);
          return;
        }

        if (standardMatch) {
          setVoiceCatalog('standard');
          setSelectedVoiceId(standardMatch.voice_id);
          return;
        }

        if (nextStandardPayload.voices.length > 0) {
          setVoiceCatalog('standard');
          setSelectedVoiceId(nextStandardPayload.voices[0].voice_id);
          return;
        }

        if (nextCustomPayload.voices.length > 0) {
          setVoiceCatalog('custom');
          setSelectedVoiceId(nextCustomPayload.voices[0].voice_id);
          return;
        }

        setSelectedVoiceId('');
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

  const voicesByCatalog = useMemo<Record<VoiceCatalogType, VoiceEntry[]>>(
    () => ({
      standard: standardPayload?.voices ?? [],
      custom: customPayload?.voices ?? [],
    }),
    [standardPayload, customPayload],
  );

  const activeVoiceOptions = useMemo(() => {
    return voicesByCatalog[voiceCatalog];
  }, [voicesByCatalog, voiceCatalog]);

  const selectedEntry = useMemo(() => {
    return activeVoiceOptions.find((voice) => voice.voice_id === selectedVoiceId) ?? null;
  }, [activeVoiceOptions, selectedVoiceId]);

  const selectedAbilityPreset = useMemo(() => {
    return (
      ABILITY_SPEED_PRESETS.find((preset) => preset.level === abilityLevel) ??
      ABILITY_SPEED_PRESETS[1]
    );
  }, [abilityLevel]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (activeVoiceOptions.length === 0) {
      if (selectedVoiceId) {
        setSelectedVoiceId('');
      }
      return;
    }

    const isSelectedInCatalog = activeVoiceOptions.some((voice) => voice.voice_id === selectedVoiceId);
    if (!isSelectedInCatalog) {
      setSelectedVoiceId(activeVoiceOptions[0].voice_id);
    }
  }, [loading, activeVoiceOptions, selectedVoiceId]);

  const onVoiceChange = (nextVoiceId: string) => {
    setSelectedVoiceId(nextVoiceId);
  };

  const applyDisabled = !selectedEntry?.voice_id?.trim();

  return (
    <section className="surface-panel fade-in admin-panel">
      <h2 className="panel-title">Admin voice settings</h2>
      <p className="panel-copy">
        Choose one voice from either the standard list or custom list. The selected voice ID will be used for
        conversation TTS. Use ability level to slightly adjust speaking speed.
      </p>

      {loading && <div className="session-loading">Loading voice options...</div>}

      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="admin-form">
          <div className="admin-tabs" role="tablist" aria-label="Voice source tabs">
            <button
              type="button"
              role="tab"
              className={`admin-tab ${voiceCatalog === 'standard' ? 'is-active' : ''}`}
              aria-selected={voiceCatalog === 'standard'}
              onClick={() => setVoiceCatalog('standard')}
              disabled={voicesByCatalog.standard.length === 0}
            >
              Standard
            </button>
            <button
              type="button"
              role="tab"
              className={`admin-tab ${voiceCatalog === 'custom' ? 'is-active' : ''}`}
              aria-selected={voiceCatalog === 'custom'}
              onClick={() => setVoiceCatalog('custom')}
              disabled={voicesByCatalog.custom.length === 0}
            >
              Custom
            </button>
          </div>

          <label className="admin-field">
            <span>{voiceCatalog === 'standard' ? 'Standard voice' : 'Custom voice'}</span>
            <select
              value={selectedVoiceId}
              onChange={(event) => onVoiceChange(event.target.value)}
              disabled={activeVoiceOptions.length === 0}
            >
              {activeVoiceOptions.map((option) => (
                <option key={option.voice_id} value={option.voice_id}>
                  {voiceCatalog === 'standard'
                    ? `${option.accent_description} (${option.dialect})`
                    : option.accent_description}
                </option>
              ))}
            </select>
          </label>

          {activeVoiceOptions.length === 0 && (
            <p className="admin-note">
              No {voiceCatalog} voices are currently configured.
            </p>
          )}

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
                selectedEntry &&
                onApply(selectedEntry.voice_id.trim(), selectedAbilityPreset.speechRate, selectedEntry.accent_description)
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
