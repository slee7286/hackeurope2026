import React from 'react';
import { ProgressOverview } from './ProgressOverview';
import { getPatientSummary } from '../api/patientData';

interface PatientHeaderProps {
  patientId: string;
}

export function PatientHeader({ patientId }: PatientHeaderProps) {
  const summary = getPatientSummary();

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Top row: avatar, patient ID, streak */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          marginBottom: '18px',
          flexWrap: 'wrap',
        }}
      >
        {/* Avatar circle */}
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            background: 'var(--color-primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {patientId.replace(/\D/g, '').slice(-2) || '?'}
        </div>

        {/* Patient info */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>
            Patient {patientId}
          </div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            Last session: {summary.lastSessionDate}
          </div>
        </div>

        {/* Streak badge */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface-alt)',
            border: '1.5px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px',
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: 'var(--font-size-lg)',
              color: 'var(--color-primary)',
            }}
          >
            {summary.streakDays}
          </span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            day streak
          </span>
        </div>
      </div>

      <ProgressOverview summary={summary} />
    </div>
  );
}
