import React, { useEffect, useRef, useState } from 'react';
import type { SpokenWordTiming } from '../hooks/useTextToSpeech';

type OrbPhase = 'idle' | 'speaking' | 'paused';
const WORD_REVEAL_LEAD_SECONDS = 0.2;

interface SpeechIndicatorOrbProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  spokenText: string | null;
  wordTimings: SpokenWordTiming[];
  captionsEnabled: boolean;
}

function estimateSyllables(word: string): number {
  const cleaned = word.replace(/[^a-zA-Z']/g, '').toLowerCase();
  if (!cleaned) return 1;
  const groups = cleaned.match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

function buildEstimatedWordTimings(words: string[], durationSeconds: number): SpokenWordTiming[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || words.length === 0) {
    return [];
  }

  const weights = words.map((word) => {
    const cleaned = word.replace(/[^a-zA-Z']/g, '');
    const syllables = estimateSyllables(word);
    const lengthWeight = Math.min(1.8, cleaned.length / 7);
    const punctuationPause = /[.!?]$/.test(word)
      ? 1.2
      : /[,;:]$/.test(word)
        ? 0.55
        : /(?:-|\u2013|\u2014)$/.test(word)
          ? 0.3
          : 0;
    return Math.max(0.65, syllables * 0.88 + lengthWeight + punctuationPause);
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || words.length;
  let cursor = 0;
  const timings: SpokenWordTiming[] = [];

  for (let i = 0; i < words.length; i += 1) {
    const slice = (weights[i] / totalWeight) * durationSeconds;
    const start = cursor;
    const end = i === words.length - 1 ? durationSeconds : cursor + slice;
    timings.push({ word: words[i], start, end: Math.max(end, start + 0.06) });
    cursor = end;
  }

  return timings;
}

export function SpeechIndicatorOrb({
  audioElement,
  isPlaying,
  spokenText,
  wordTimings,
  captionsEnabled,
}: SpeechIndicatorOrbProps) {
  const ambientHaloRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const innerCoreRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(audioElement);
  const wordTimingsRef = useRef<SpokenWordTiming[]>(wordTimings);
  const rafRef = useRef<number | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const phaseRef = useRef<OrbPhase>('idle');
  const previousPlayingRef = useRef(false);
  const releaseStartedAtRef = useRef<number | null>(null);
  const lastReactiveLevelRef = useRef(0.2);
  const signalLevelRef = useRef(0);
  const displayLevelRef = useRef(0.12);
  const displayVelocityRef = useRef(0);
  const wordsRef = useRef<string[]>([]);
  const activeWordIndexRef = useRef(-1);
  const wordFadeMsRef = useRef(520);
  const estimatedWordTimingsRef = useRef<SpokenWordTiming[]>([]);
  const estimatedDurationRef = useRef(0);
  const estimatedWordsSignatureRef = useRef('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<{
    source: MediaElementAudioSourceNode;
    analyser: AnalyserNode;
    data: Uint8Array<ArrayBuffer>;
  } | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [wordFadeMs, setWordFadeMs] = useState(520);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    audioElementRef.current = audioElement;
  }, [audioElement]);

  useEffect(() => {
    wordTimingsRef.current = wordTimings;
  }, [wordTimings]);

  useEffect(() => {
    const words =
      wordTimings.length > 0 ? wordTimings.map((timing) => timing.word) : (spokenText ?? '').match(/\S+/g) ?? [];
    wordsRef.current = words;
    estimatedWordTimingsRef.current = [];
    estimatedDurationRef.current = 0;
    estimatedWordsSignatureRef.current = words.join('\u0001');
    activeWordIndexRef.current = -1;
    setActiveWordIndex(-1);
  }, [spokenText, wordTimings]);

  useEffect(() => {
    if (audioNodesRef.current) {
      audioNodesRef.current.source.disconnect();
      audioNodesRef.current.analyser.disconnect();
      audioNodesRef.current = null;
    }

    if (!audioElement) return;

    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) return;

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;

    try {
      const source = context.createMediaElementSource(audioElement);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.75;

      source.connect(analyser);
      analyser.connect(context.destination);

      audioNodesRef.current = {
        source,
        analyser,
        data: new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>,
      };
    } catch {
      audioNodesRef.current = null;
    }

    if (context.state === 'suspended') {
      void context.resume().catch(() => {
        // Ignore autoplay policy errors; the orb will recover on the next user gesture.
      });
    }

    return () => {
      if (audioNodesRef.current) {
        audioNodesRef.current.source.disconnect();
        audioNodesRef.current.analyser.disconnect();
        audioNodesRef.current = null;
      }
    };
  }, [audioElement]);

  useEffect(() => {
    const animate = (timestamp: number) => {
      const playing = isPlayingRef.current;

      if (playing && audioContextRef.current?.state === 'suspended') {
        void audioContextRef.current.resume().catch(() => {
          // Ignore autoplay policy errors; the orb will recover on the next user gesture.
        });
      }

      if (previousPlayingRef.current && !playing) {
        releaseStartedAtRef.current = timestamp;
        lastReactiveLevelRef.current = Math.max(displayLevelRef.current, signalLevelRef.current, 0.16);
      }
      if (!previousPlayingRef.current && playing) {
        releaseStartedAtRef.current = null;
      }
      previousPlayingRef.current = playing;

      let amplitude = 0;
      const nodes = audioNodesRef.current;
      if (playing && nodes) {
        nodes.analyser.getByteTimeDomainData(nodes.data);
        let sum = 0;
        for (let i = 0; i < nodes.data.length; i += 1) {
          const centered = (nodes.data[i] - 128) / 128;
          sum += centered * centered;
        }
        amplitude = Math.sqrt(sum / nodes.data.length);
      }

      const normalized = Math.min(1, Math.max(0, (amplitude - 0.01) * 5.8));
      signalLevelRef.current = signalLevelRef.current * 0.82 + normalized * 0.18;

      const idlePrimary = Math.sin(timestamp * 0.00215);
      const idleSecondary = Math.sin(timestamp * 0.00105 + 1.1);
      const idlePulse = Math.min(0.26, Math.max(0.07, 0.14 + idlePrimary * 0.048 + idleSecondary * 0.018));
      let target = idlePulse;

      if (playing) {
        phaseRef.current = 'speaking';
        target = Math.max(signalLevelRef.current, idlePulse * 0.72);
        lastReactiveLevelRef.current = target;
      } else if (releaseStartedAtRef.current !== null) {
        phaseRef.current = 'paused';
        const progress = Math.min((timestamp - releaseStartedAtRef.current) / 700, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        target = lastReactiveLevelRef.current * (1 - eased) + idlePulse * eased;
        if (progress >= 1) {
          phaseRef.current = 'idle';
          releaseStartedAtRef.current = null;
        }
      } else {
        phaseRef.current = 'idle';
      }

      const springStrength = 0.12;
      const damping = 0.78;
      displayVelocityRef.current += (target - displayLevelRef.current) * springStrength;
      displayVelocityRef.current *= damping;
      displayLevelRef.current = Math.min(1, Math.max(0, displayLevelRef.current + displayVelocityRef.current));

      const level = displayLevelRef.current;
      const phase = phaseRef.current;
      const words = wordsRef.current;
      const ambientHalo = ambientHaloRef.current;
      const core = coreRef.current;
      const innerCore = innerCoreRef.current;
      const sheen = sheenRef.current;

      const activeAudio = audioElementRef.current;
      if (playing && words.length > 0 && activeAudio) {
        const duration = activeAudio.duration;
        const ledTime = Math.max(0, activeAudio.currentTime + WORD_REVEAL_LEAD_SECONDS);
        let timings = wordTimingsRef.current;
        let nextWordIndex = 0;

        if (timings.length === 0 && Number.isFinite(duration) && duration > 0) {
          const wordsSignature = words.join('\u0001');
          const shouldRecalculate =
            estimatedWordTimingsRef.current.length !== words.length ||
            estimatedWordsSignatureRef.current !== wordsSignature ||
            Math.abs(estimatedDurationRef.current - duration) > 0.08;

          if (shouldRecalculate) {
            estimatedWordTimingsRef.current = buildEstimatedWordTimings(words, duration);
            estimatedDurationRef.current = duration;
            estimatedWordsSignatureRef.current = wordsSignature;
          }
          timings = estimatedWordTimingsRef.current;
        }

        if (timings.length > 0) {
          nextWordIndex = -1;
          for (let i = 0; i < timings.length; i += 1) {
            if (ledTime >= timings[i].start) {
              nextWordIndex = i;
            } else {
              break;
            }
          }

          if (nextWordIndex >= 0) {
            const selectedTiming = timings[nextWordIndex];
            const wordDurationMs = Math.round((selectedTiming.end - selectedTiming.start) * 1000);
            const boundedMs = Math.min(760, Math.max(220, wordDurationMs + 70));
            if (Math.abs(boundedMs - wordFadeMsRef.current) > 25) {
              wordFadeMsRef.current = boundedMs;
              setWordFadeMs(boundedMs);
            }
          }
        } else if (Number.isFinite(duration) && duration > 0) {
          const progress = Math.min(0.999, Math.max(0, ledTime / duration));
          nextWordIndex = Math.min(words.length - 1, Math.floor(progress * words.length));
          const avgWordMs = Math.round((duration * 1000) / words.length);
          const boundedMs = Math.min(900, Math.max(260, avgWordMs));
          if (Math.abs(boundedMs - wordFadeMsRef.current) > 35) {
            wordFadeMsRef.current = boundedMs;
            setWordFadeMs(boundedMs);
          }
        } else {
          nextWordIndex = Math.min(words.length - 1, Math.floor(ledTime * 2.4));
        }

        if (nextWordIndex !== activeWordIndexRef.current) {
          activeWordIndexRef.current = nextWordIndex;
          setActiveWordIndex(nextWordIndex);
        }
      } else if (!playing && activeWordIndexRef.current !== -1) {
        activeWordIndexRef.current = -1;
        setActiveWordIndex(-1);
      }

      if (ambientHalo) {
        const idleHaloWave = Math.sin(timestamp * 0.0017) * 0.02;
        const idleHaloBoost = phase === 'idle' ? 0.11 + idleHaloWave : phase === 'paused' ? 0.05 : 0;
        const haloScale = 1.08 + level * 1.35 + idleHaloBoost;
        const haloOpacity =
          phase === 'speaking' ? 0.24 + level * 0.46 : phase === 'idle' ? 0.2 + level * 0.42 : 0.17 + level * 0.34;
        ambientHalo.style.transform = `scale(${haloScale.toFixed(3)})`;
        ambientHalo.style.opacity = haloOpacity.toFixed(3);
      }

      if (core) {
        const scale = 1 + level * 0.42;
        const glowSpread = 40 + level * 112;
        const glowOpacity = phase === 'speaking' ? 0.34 + level * 0.28 : 0.2 + level * 0.18;
        core.style.transform = `translateZ(0) scale(${scale.toFixed(3)})`;
        core.style.boxShadow = `0 0 ${glowSpread.toFixed(1)}px rgba(33, 133, 255, ${glowOpacity.toFixed(
          3
        )}), 0 0 ${(glowSpread * 0.55).toFixed(1)}px rgba(120, 170, 255, ${(glowOpacity * 0.72).toFixed(
          3
        )}), inset 0 0 ${(11 + level * 20).toFixed(1)}px rgba(255, 255, 255, ${(0.16 + level * 0.1).toFixed(3)})`;
      }

      if (innerCore) {
        const innerScale = 0.9 + level * 0.16;
        innerCore.style.transform = `scale(${innerScale.toFixed(3)})`;
        innerCore.style.opacity = (0.72 + Math.min(level * 0.14, 0.1)).toFixed(3);
      }

      if (sheen) {
        const sheenScale = 1 + level * 0.04;
        sheen.style.transform = `rotate(${(timestamp * 0.012) % 360}deg) scale(${sheenScale.toFixed(3)})`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (audioNodesRef.current) {
        audioNodesRef.current.source.disconnect();
        audioNodesRef.current.analyser.disconnect();
        audioNodesRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {
          // Ignore close errors during unmount.
        });
        audioContextRef.current = null;
      }
    };
  }, []);

  const captionWords =
    wordTimings.length > 0 ? wordTimings.map((timing) => timing.word) : (spokenText ?? '').match(/\S+/g) ?? [];

  return (
    <div className="speech-orb-shell" aria-label="Speech playback indicator" role="status">
      <div className="speech-orb-stage">
        <div ref={ambientHaloRef} className="speech-orb-ambient" />
        <div ref={coreRef} className="speech-orb-core">
          <div ref={innerCoreRef} className="speech-orb-core-inner" />
          <div ref={sheenRef} className="speech-orb-sheen" />
        </div>
      </div>
      {captionsEnabled && (
        <div
          className={`speech-orb-caption ${isPlaying && activeWordIndex >= 0 ? 'is-playing' : 'is-idle'}`}
          style={{ '--word-fade-ms': `${wordFadeMs}ms` } as React.CSSProperties}
        >
          <span className="speech-orb-sentence">
            {captionWords.map((word, index) => (
              <span key={`${word}-${index}`} className={`speech-orb-word ${index <= activeWordIndex ? 'is-visible' : ''}`}>
                {word}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
