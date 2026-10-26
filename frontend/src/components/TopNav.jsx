import React from 'react';

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
  const statusText =
    syncStatus === 'synced'
      ? 'Live Synced'
      : syncStatus === 'saving'
      ? 'Syncing…'
      : '⚠️ Unsaved';

  return (
    <nav className="top-nav-bar" aria-label="Club Portal Header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            if (onNavigate) onNavigate('home');
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            textDecoration: 'none',
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: '13.5px',
            letterSpacing: '0.04em',
            minHeight: '44px',
          }}
        >
          <img
            src={(typeof window !== 'undefined' && window.CLUB_LOGO_URL) || '/club-logo.jpg'}
            alt="Ruiru Titans FC"
            style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'contain', border: '1px solid rgba(255, 149, 0, 0.5)' }}
          />
          <span style={{ fontWeight: 800 }}>RUIRU TITANS FC</span>
        </a>

        {/* Desktop / Tablet Segmented Navigation */}
        <div
          className="desktop-nav-segments"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'var(--bg-surface-elevated)',
            padding: '3px',
            borderRadius: '999px',
            border: 'var(--hairline-border)',
            gap: '2px',
          }}
        >
          {[
            { key: 'home', label: '🏠 Home' },
            { key: 'championship', label: '🏆 Championship' },
            { key: 'table', label: '📊 Table' },
            { key: 'fixtures', label: '⚽ Fixtures' },
            { key: 'cup', label: '🏆 Cup' },
            { key: 'tactics', label: '📋 Tactics' },
            { key: 'highlights', label: '🎥 Highlights' },
            { key: 'archives', label: '🏛️ Archives' },
          ].map((item) => {
            const isActive = currentView === item.key;
            return (
              <a
                key={item.key}
                href={`#${item.key}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigate) onNavigate(item.key);
                }}
                style={{
                  textDecoration: 'none',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  padding: '6px 12px',
                  borderRadius: '999px',
                  background: isActive ? 'var(--accent-orange)' : 'transparent',
                  color: isActive ? '#000000' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                  minHeight: '32px',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {item.label}
              </a>
            );
          })}
        </div>

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

        {isCmsMode && (
          <span
            style={{
              background: 'var(--accent-orange-soft)',
              border: '1px solid var(--accent-orange-border)',
              color: 'var(--accent-orange-vibrant)',
              fontSize: '11px',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '999px',
              letterSpacing: '0.06em',
            }}
          >
            🛠️ MANAGER DASHBOARD
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Player Auth Status / Sign-In */}
        {playerUser ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--bg-surface-elevated)',
              border: 'var(--hairline-border)',
              borderRadius: '999px',
              padding: '4px 12px',
              fontSize: '12px',
              color: 'var(--text-primary)',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: playerUser.team_color || 'var(--status-success)',
              }}
            />
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
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Open your Player Dashboard"
            >
              ⚽ <strong>{playerUser.name}</strong> ({playerUser.team_name})
              <span
                style={{
                  fontSize: '10px',
                  color: currentView === 'player-dashboard' ? '#000000' : 'var(--accent-orange-vibrant)',
                  background: currentView === 'player-dashboard' ? 'var(--accent-orange)' : 'var(--accent-orange-soft)',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontWeight: 800,
                }}
              >
                Dashboard
              </span>
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
                marginLeft: '6px',
                padding: '2px 4px',
              }}
              title="Sign out of Player account"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => onOpenAuthModal && onOpenAuthModal('player')}
              className="admin-link"
              style={{
                background: 'var(--bg-surface-elevated)',
                color: 'var(--text-primary)',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                cursor: 'pointer',
              }}
            >
              ⚽ Player Sign In
            </button>
            <button
              type="button"
              onClick={() => onOpenAuthModal && onOpenAuthModal('lookup')}
              className="admin-link"
              style={{
                background: 'var(--bg-surface-elevated)',
                color: 'var(--accent-orange-vibrant)',
                borderColor: 'var(--accent-orange-border)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Search for your official username by your name"
            >
              🔍 Find Username
            </button>
          </div>
        )}

        {/* Manager Dashboard Sign-In / Mode Switcher */}
        {!playerUser && (
          cmsUser && isCmsMode ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  if (onNavigate) onNavigate('manage');
                }}
                className="admin-link"
                style={{
                  background: currentView === 'manage' ? 'var(--accent-orange)' : 'var(--bg-surface-elevated)',
                  color: currentView === 'manage' ? '#000000' : 'var(--text-primary)',
                  borderColor: currentView === 'manage' ? 'var(--accent-orange)' : 'rgba(255, 255, 255, 0.15)',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                🛠️ Manager
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onToggleCmsMode) onToggleCmsMode(false);
                  if (onNavigate) onNavigate('home');
                }}
                className="admin-link"
                style={{
                  background: 'var(--bg-surface-elevated)',
                  color: 'var(--text-secondary)',
                  borderColor: 'rgba(255, 255, 255, 0.15)',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                🏠 Home
              </button>
              <button
                type="button"
                onClick={() => (onLogoutCms ? onLogoutCms() : onLogout && onLogout('cms'))}
                className="admin-link"
                style={{
                  background: 'rgba(255, 69, 58, 0.15)',
                  color: 'var(--status-danger)',
                  borderColor: 'rgba(255, 69, 58, 0.3)',
                  cursor: 'pointer',
                }}
                title="Sign out of Manager Dashboard"
              >
                Logout
              </button>
            </div>
          ) : (
            <a
              href="#manager-signin"
              onClick={(e) => {
                e.preventDefault();
                onOpenAuthModal && onOpenAuthModal('cms');
              }}
              className="admin-link"
              style={{
                background: 'var(--accent-orange)',
                color: '#000000',
                borderColor: 'var(--accent-orange)',
                fontWeight: 800,
                padding: '6px 14px',
              }}
            >
              🔐 Manager Sign In
            </a>
          )
        )}
      </div>
    </nav>
  );
}
