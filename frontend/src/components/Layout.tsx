import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  showBackButton?: boolean;
  onBackButtonClick?: () => void;
}

export function Layout({ children, showBackButton = false, onBackButtonClick }: LayoutProps) {
  return (
    <div className="app-shell">
      <div className="app-container">
        <header className="app-header">
          <div className="app-brand">
            <div className="brand-dot" aria-hidden="true" />
            <div>
              <h1 className="brand-title">Speech Therapy</h1>
              <p className="brand-subtitle">Care session workspace</p>
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
