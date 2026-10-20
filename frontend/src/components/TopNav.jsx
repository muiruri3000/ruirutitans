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
      ? 'Live Database Synced'
      : syncStatus === 'saving'
      ? 'Syncing Changes…'
      : 'Offline Cache Active';

  return (
    <nav className="top-nav-bar" aria-label="Club Portal & Authentication Bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            if (onNavigate) onNavigate('home');
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            color: '#F4F2EA',
            fontWeight: 800,
            fontSize: '13px',
            letterSpacing: '0.05em',
          }}
        >
          <img
            src={(typeof window !== 'undefined' && window.CLUB_LOGO_URL) || '/club-logo.jpg'}
            alt="Ruiru Titans FC"
            style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'contain' }}
          />
          <span>RUIRU TITANS FC</span>
        </a>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              if (onNavigate) onNavigate('home');
            }}
            style={{
              textDecoration: 'none',
              fontSize: '11.5px',
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: '999px',
              background: currentView === 'home' ? '#C9A227' : '#113328',
              color: currentView === 'home' ? '#16201B' : '#DDE6DF',
              border: '1px solid #2B5746',
            }}
          >
            🏠 Home
          </a>
          <a
            href="#championship"
            onClick={(e) => {
              e.preventDefault();
              if (onNavigate) onNavigate('championship');
            }}
            style={{
              textDecoration: 'none',
              fontSize: '11.5px',
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: '999px',
              background: currentView === 'championship' ? '#C9A227' : '#113328',
              color: currentView === 'championship' ? '#16201B' : '#DDE6DF',
              border: '1px solid #2B5746',
            }}
          >
            🏆 Championship
          </a>
          <a
            href="#highlights"
            onClick={(e) => {
              e.preventDefault();
              if (onNavigate) onNavigate('highlights');
            }}
            style={{
              textDecoration: 'none',
              fontSize: '11.5px',
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: '999px',
              background: currentView === 'highlights' ? '#C9A227' : '#113328',
              color: currentView === 'highlights' ? '#16201B' : '#DDE6DF',
              border: '1px solid #2B5746',
            }}
          >
            🎥 Highlights
          </a>
          <a
            href="#archives"
            onClick={(e) => {
              e.preventDefault();
              if (onNavigate) onNavigate('archives');
            }}
            style={{
              textDecoration: 'none',
              fontSize: '11.5px',
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: '999px',
              background: currentView === 'archives' ? '#C9A227' : '#113328',
              color: currentView === 'archives' ? '#16201B' : '#DDE6DF',
              border: '1px solid #2B5746',
            }}
          >
            🏛️ Archives
          </a>
        </div>

        <div className="sync-badge">
          <span className={`sync-dot ${syncStatus}`} />
          <span>{statusText}</span>
        </div>

        {isCmsMode && (
          <span
            style={{
              background: 'rgba(201, 162, 39, 0.2)',
              border: '1px solid #C9A227',
              color: '#C9A227',
              fontSize: '10.5px',
              fontWeight: 800,
              padding: '2px 8px',
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
              gap: '6px',
              background: '#113328',
              border: '1px solid #2F7D5C',
              borderRadius: '999px',
              padding: '3px 10px',
              fontSize: '11.5px',
              color: '#DDE6DF',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: playerUser.team_color || '#22C55E',
              }}
            />
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('player-dashboard')}
              style={{
                background: 'none',
                border: 'none',
                color: currentView === 'player-dashboard' ? '#C9A227' : '#F4F2EA',
                fontWeight: 800,
                cursor: 'pointer',
                padding: 0,
                fontSize: '11.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Open your Player Dashboard"
            >
              ⚽ <strong>{playerUser.name}</strong> ({playerUser.team_name})
              <span
                style={{
                  fontSize: '9.5px',
                  color: currentView === 'player-dashboard' ? '#16201B' : '#6CE5A0',
                  background: currentView === 'player-dashboard' ? '#C9A227' : 'rgba(108,229,160,0.18)',
                  padding: '1px 5px',
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
                color: '#FF9990',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                marginLeft: '4px',
                padding: '0 2px',
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
                background: '#113328',
                color: '#DDE6DF',
                borderColor: '#2B5746',
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
                background: '#0B2920',
                color: '#C9A227',
                borderColor: '#2B5746',
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

        {/* Manager Dashboard Sign-In / Mode Switcher (Hidden when player is signed in) */}
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
                  background: currentView === 'manage' ? '#C9A227' : '#163E31',
                  color: currentView === 'manage' ? '#16201B' : '#F4F2EA',
                  borderColor: currentView === 'manage' ? '#C9A227' : '#2F7D5C',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                🛠️ Manager Dashboard
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onToggleCmsMode) onToggleCmsMode(false);
                  if (onNavigate) onNavigate('home');
                }}
                className="admin-link"
                style={{
                  background: '#F4F2EA',
                  color: '#16201B',
                  borderColor: '#F4F2EA',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                🏠 Home
              </button>
              <button
                type="button"
                onClick={() => (onLogoutCms ? onLogoutCms() : onLogout && onLogout('cms'))}
                className="admin-link"
                style={{
                  background: 'rgba(178, 58, 46, 0.2)',
                  color: '#FF9990',
                  borderColor: '#B23A2E',
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
                background: '#C9A227',
                color: '#16201B',
                borderColor: '#C9A227',
                fontWeight: 800,
                padding: '4px 12px',
              }}
            >
              🔐 Open Manager Dashboard
            </a>
          )
        )}
      </div>
    </nav>
  );
}
