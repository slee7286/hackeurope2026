import React from 'react';
import type { PatientSummary } from '../api/patientData';

interface ProgressOverviewProps {
  summary: PatientSummary;
}

function RatingDots({ count }: { count: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: '4px' }}>
      {Array.from({ length: 3 }, (_, i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            display: 'inline-block',
            background: i < count ? 'var(--color-warning)' : 'var(--color-border)',
          }}
        />
      ))}
    </span>
  );
}

export function ProgressOverview({ summary }: ProgressOverviewProps) {
  // Show up to 20 session dots; recent `streakDays` are highlighted
  const dotCount = Math.min(summary.totalSessions, 20);
  const streakStart = dotCount - summary.streakDays;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Session history dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            marginRight: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          Sessions:
        </span>
        {Array.from({ length: dotCount }, (_, i) => (
          <div
            key={i}
            title={`Session ${i + 1}`}
            style={{
              width: 13,
              height: 13,
              borderRadius: '50%',
              background: i >= streakStart ? 'var(--color-accent-rose)' : 'var(--color-primary)',
              opacity: i >= streakStart ? 1 : 0.35,
              transition: 'opacity 0.2s',
            }}
          />
        ))}
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            marginLeft: '4px',
          }}
        >
          {summary.totalSessions} total
        </span>
      </div>

      {/* Skill tiles */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {summary.skills.map((skill) => (
          <div
            key={skill.name}
            style={{
              background: 'var(--color-surface-alt)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 14px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              minWidth: '76px',
              border: '1.5px solid var(--color-border)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                color: 'var(--color-text)',
              }}
            >
              {skill.name}
            </span>
            <RatingDots count={skill.stars} />
          </div>
        ))}
      </div>
    </div>
  );
}