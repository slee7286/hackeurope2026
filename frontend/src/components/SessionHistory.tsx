import React, { useEffect, useState } from 'react';
import { getSessionHistory, type SessionHistoryItem } from '../api/patientData';

interface SessionHistoryProps {
  patientId?: string;
}

export function SessionHistory({ patientId = 'P-12345' }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const items = await getSessionHistory(patientId, 20);
        if (!cancelled) {
          setSessions(items);
        }
      } catch (err) {
        if (!cancelled) {
          const detail = err instanceof Error ? err.message : String(err);
          setError(`Could not load session history: ${detail}`);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  return (
    <section className="surface-panel">
      <h2 className="panel-title">Session history</h2>
      <p className="panel-copy">Recent completed sessions and outcomes.</p>

      {isLoading && (
        <p className="panel-copy" role="status">
          Loading session history...
        </p>
      )}

      {error && (
        <p className="panel-copy" style={{ color: 'var(--color-danger)', fontWeight: 700 }}>
          {error}
        </p>
      )}

      {!isLoading && !error && sessions.length === 0 && (
        <p className="panel-copy">No completed practice sessions yet.</p>
      )}

      {!isLoading && !error && sessions.length > 0 && (
        <div className="history-list">
          {sessions.map((session, index) => {
            const date = new Date(session.date);
            const dateLabel = Number.isNaN(date.getTime())
              ? session.date
              : date.toLocaleDateString();

            return (
              <article className="history-item fade-in" key={session.id}>
                <div className="history-row">
                  <span className="history-number">Session {sessions.length - index}</span>
                  <span className="history-date">{dateLabel}</span>
                </div>
                <p className="history-summary">{session.summary}</p>
                <p className="history-performance">Performance: {session.performance}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
