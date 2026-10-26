import React, { useState } from 'react';

export default function TopNav({
  syncStatus,
  cmsUser,
  playerUser,
  isCmsMode,
  currentView,
  onNavigate,
  onToggleCmsMode,
  onOpenAuthModal,
  onLogout,
  onLogoutCms,
  onLogoutPlayer,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const statusText =
    syncStatus === 'synced'
      ? 'Live Synced'
      : syncStatus === 'saving'
      ? 'Syncing…'
      : '⚠️ Unsaved';

  const navItems = [
    { key: 'home', label: '🏠 Home' },
    { key: 'championship', label: '🏆 Championship' },
    { key: 'table', label: '📊 Table' },
    { key: 'fixtures', label: '⚽ Fixtures & Results' },
    { key: 'cup', label: '🏆 Cup' },
    { key: 'tactics', label: '📋 Tactics' },
    { key: 'stats', label: '📈 Stats' },
    { key: 'voting', label: '⭐ Voting' },
    { key: 'highlights', label: '🎥 Highlights' },
    { key: 'archives', label: '🏛️ Archives' },
    { key: 'balancer', label: '⚖️ Balancer' },
  ];

  return (
    <header className="top-nav-bar" aria-label="Club Portal Header">
      {/* Top Header Row */}
      <div className="top-nav-row-main">
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setIsMenuOpen(false);
            if (onNavigate) onNavigate('home');
          }}
          className="top-nav-brand"
        >
          <img
            src={(typeof window !== 'undefined' && window.CLUB_LOGO_URL) || '/club-logo.jpg'}
            alt="Ruiru Titans FC"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              objectFit: 'contain',
              border: '1.5px solid #FF9500',
              flexShrink: 0,
            }}
          />
          <span className="brand-title">RUIRU TITANS FC</span>
        </a>

        {/* Sync & Auth Actions */}
        <div className="top-nav-actions">
          <div
            className="sync-badge"
            style={syncStatus === 'error' ? { cursor: 'pointer', borderColor: 'var(--status-danger)' } : {}}
            onClick={() => {
              if (syncStatus === 'error' && onOpenAuthModal) {
                onOpenAuthModal('cms');
              }
            }}
            title={syncStatus === 'error' ? 'Manager login required to sync changes. Click to sign in.' : undefined}
          >
            <span className={`sync-dot ${syncStatus}`} />
            <span>{statusText}</span>
          </div>

          {/* Player Auth Status */}
          {playerUser ? (
            <div
              className="desktop-auth-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-surface-elevated)',
                border: 'var(--hairline-border)',
                borderRadius: '999px',
                padding: '4px 10px',
                fontSize: '11.5px',
                color: 'var(--text-primary)',
              }}
            >
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('player-dashboard')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: currentView === 'player-dashboard' ? 'var(--accent-orange-vibrant)' : '#FFFFFF',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '11.5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                ⚽ <strong>{playerUser.name}</strong>
              </button>
              <button
                type="button"
                onClick={() => (onLogoutPlayer ? onLogoutPlayer() : onLogout && onLogout('player'))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--status-danger)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '1px 3px',
                }}
                title="Sign out"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAuthModal && onOpenAuthModal('player')}
              className="admin-link desktop-auth-btn"
              style={{
                fontSize: '11.5px',
                padding: '4px 10px',
                minHeight: '34px',
                cursor: 'pointer',
              }}
            >
              ⚽ Sign In
            </button>
          )}

          {/* Manager Auth Button */}
          {!playerUser && (
            cmsUser && isCmsMode ? (
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('manage')}
                className="admin-link desktop-auth-btn"
                style={{
                  background: currentView === 'manage' ? 'var(--accent-orange)' : 'var(--bg-surface-elevated)',
                  color: currentView === 'manage' ? '#000000' : 'var(--text-primary)',
                  fontSize: '11.5px',
                  padding: '4px 10px',
                  minHeight: '34px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🛠️ CMS
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuthModal && onOpenAuthModal('cms')}
                className="admin-link desktop-auth-btn"
                style={{
                  background: 'var(--accent-orange)',
                  color: '#000000',
                  fontSize: '11.5px',
                  padding: '4px 10px',
                  minHeight: '34px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🔐 CMS
              </button>
            )
          )}

          {/* Hamburger Menu Toggle Button for Small Screens */}
          <button
            type="button"
            className="hamburger-btn"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Desktop Navigation Segments Bar: Visible on screens > 768px */}
      <nav
        className="top-nav-segments-bar desktop-segments"
        aria-label="Desktop Club Navigation"
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        {navItems.map((item) => {
          const isActive = currentView === item.key;
          return (
            <a
              key={item.key}
              href={`#${item.key}`}
              onClick={(e) => {
                e.preventDefault();
                if (onNavigate) onNavigate(item.key);
              }}
              className={`top-nav-pill ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Mobile Hamburger Dropdown Menu: Visible when opened on small screens */}
      {isMenuOpen && (
        <div
          className="hamburger-dropdown"
          onClick={() => setIsMenuOpen(false)}
        >
          <div
            className="hamburger-dropdown-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-orange-vibrant)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Navigation Menu
              </span>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8E8E93',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '2px 8px',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '65vh', overflowY: 'auto', padding: '6px 0' }}>
              {navItems.map((item) => {
                const isActive = currentView === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      if (onNavigate) onNavigate(item.key);
                    }}
                    className={`hamburger-menu-item ${isActive ? 'active' : ''}`}
                  >
                    <span>{item.label}</span>
                    {isActive && <span style={{ color: '#000000', fontWeight: 900 }}>✓</span>}
                  </button>
                );
              })}
            </div>

            <div className="hamburger-dropdown-divider" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}>
              {playerUser ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onNavigate && onNavigate('player-dashboard');
                  }}
                  className="hamburger-action-btn"
                  style={{ background: 'rgba(255, 149, 0, 0.15)', color: 'var(--accent-orange-vibrant)' }}
                >
                  ⚽ Player Dashboard ({playerUser.name})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenAuthModal && onOpenAuthModal('player');
                  }}
                  className="hamburger-action-btn"
                  style={{ background: '#1C1C1E', color: '#FFFFFF' }}
                >
                  ⚽ Player Sign In (Vote & Dashboard)
                </button>
              )}

              {cmsUser && isCmsMode ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onNavigate && onNavigate('manage');
                  }}
                  className="hamburger-action-btn"
                  style={{ background: 'var(--accent-orange)', color: '#000000', fontWeight: 800 }}
                >
                  🛠️ Manager Dashboard Active
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenAuthModal && onOpenAuthModal('cms');
                  }}
                  className="hamburger-action-btn"
                  style={{ background: 'var(--accent-orange)', color: '#000000', fontWeight: 800 }}
                >
                  🔐 Open Manager Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
