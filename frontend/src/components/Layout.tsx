import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px 40px',
        background: 'var(--color-bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 'var(--max-width)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* App title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '4px' }}>
          <span style={{ fontSize: '26px' }}>🧠</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--color-text)' }}>
              Therapy Session
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              Speech &amp; language practice
            </div>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
