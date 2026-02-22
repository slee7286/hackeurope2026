import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  showBackButton?: boolean;
  onBackButtonClick?: () => void;
  sessionMode?: 'checkin' | 'practice';
}

export function Layout({
  children,
  showBackButton = false,
  onBackButtonClick,
  sessionMode = 'checkin',
}: LayoutProps) {
  const shellClassName = `app-shell${sessionMode === 'practice' ? ' app-shell--practice' : ''}`;

  return (
    <div className={shellClassName}>
      <div className="app-container">
        <header className="app-header">
          <div className="app-brand">
            <img className="brand-logo" src="/logo.png" alt="Speech-Therapy.ai logo" />
            <div>
              <h1 className="brand-title">Speech-Therapy.ai</h1>
              <p className="brand-subtitle">Adaptive therapy, real progress</p>
            </div>
          </div>
          {showBackButton && onBackButtonClick && (
            <button className="header-back-btn" onClick={onBackButtonClick}>
              {'Back to home'}
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
