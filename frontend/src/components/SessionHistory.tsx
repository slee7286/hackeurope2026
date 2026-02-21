import React from 'react';
import { getSessionHistory } from '../api/patientData';

export function SessionHistory() {
  const sessions = getSessionHistory();

  return (
    <section className="surface-panel">
      <h2 className="panel-title">Session history</h2>
      <p className="panel-copy">Recent completed sessions and outcomes.</p>

      <div className="history-list">
        {sessions.map((session, index) => (
          <article className="history-item fade-in" key={session.id}>
            <div className="history-row">
              <span className="history-number">Session {index + 1}</span>
              <span className="history-date">{session.date}</span>
            </div>
            <p className="history-summary">{session.summary}</p>
            <p className="history-performance">Performance: {session.performance}</p>
          </article>
        ))}
      </div>
    </section>
  );
}