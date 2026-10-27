import React, { useState, useRef, useEffect } from 'react';

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
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const loginDropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (loginDropdownRef.current && !loginDropdownRef.current.contains(event.target)) {
        setIsLoginOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const statusText =
    syncStatus === 'synced'
      ? 'Live Synced'
      : syncStatus === 'saving'
      ? 'Syncing…'
      : '⚠️ Unsaved';

  const isAdmin = Boolean(cmsUser);
  const isLoggedIn = Boolean(playerUser || cmsUser);

  const navItems = [
    { key: 'home', label: '🏠 Home' },
    { key: 'championship', label: '🏆 Championship' },
    { key: 'table', label: '📊 Table' },
    { key: 'fixtures', label: '⚽ Fixtures & Results' },
    { key: 'duty', label: '🧹 Duty Roster' },
    { key: 'cup', label: '🏆 Cup' },
    ...(isAdmin ? [{ key: 'tactics', label: '📋 Tactics' }] : []),
    { key: 'stats', label: '📈 Stats' },
    ...(isLoggedIn ? [{ key: 'voting', label: '⭐ Voting' }] : []),
    { key: 'highlights', label: '🎥 Highlights' },
    { key: 'archives', label: '🏛️ Archives' },
    ...(isAdmin ? [{ key: 'balancer', label: '⚖️ Balancer' }] : []),
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
          {/* Live Sync Status Badge: Positioned side by side with the Login Dropdown */}
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

          {/* Unified Log In Dropdown: Side by side with the Live Synced badge */}
          <div className="login-dropdown-wrapper" ref={loginDropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="login-dropdown-btn"
              onClick={() => {
                setIsLoginOpen(!isLoginOpen);
                setIsMenuOpen(false);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: isLoginOpen
                  ? '#FF9500'
                  : playerUser || cmsUser
                  ? 'var(--bg-surface-elevated)'
                  : '#FF9500',
                color: isLoginOpen
                  ? '#000000'
                  : playerUser || cmsUser
                  ? 'var(--text-primary)'
                  : '#16201B',
                border: playerUser || cmsUser
                  ? '1px solid rgba(255, 255, 255, 0.16)'
                  : '1px solid #FF9500',
                borderRadius: '999px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                minHeight: '34px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s ease',
                boxShadow: isLoginOpen || (!playerUser && !cmsUser) ? '0 2px 10px rgba(255, 149, 0, 0.25)' : 'none',
              }}
              aria-label="Account Login and Profile"
              aria-expanded={isLoginOpen}
            >
              <span>
                {playerUser
                  ? `⚽ ${playerUser.name}`
                  : cmsUser
                  ? `🛠️ ${cmsUser.username || 'Manager'}`
                  : 'Log in'}
              </span>
              <span
                style={{
                  fontSize: '9px',
                  display: 'inline-block',
                  transform: isLoginOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                }}
              >
                ▼
              </span>
            </button>

            {/* Dropdown Menu when clicked */}
            {isLoginOpen && (
              <div
                className="login-dropdown-menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  minWidth: '280px',
                  maxWidth: 'calc(100vw - 24px)',
                  background: 'rgba(20, 20, 22, 0.98)',
                  backdropFilter: 'blur(24px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: '16px',
                  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 149, 0, 0.25)',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  zIndex: 1100,
                }}
              >
                {/* 1. Manager Login */}
                <button
                  type="button"
                  onClick={() => {
                    setIsLoginOpen(false);
                    if (cmsUser && isCmsMode) {
                      if (onNavigate) onNavigate('manage');
                    } else {
                      if (onOpenAuthModal) onOpenAuthModal('cms');
                    }
                  }}
                  className="login-dropdown-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'transparent',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: '18px' }}>🔐</span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 800, color: '#FFFFFF' }}>
                      {cmsUser && isCmsMode ? 'Manager Dashboard (Active)' : 'Manager Login'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8E8E93', marginTop: '1px' }}>
                      Fixtures, team rosters &amp; settings
                    </span>
                  </div>
                </button>

                {/* 2. Player Sign In (Dashboard and Voting) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsLoginOpen(false);
                    if (playerUser) {
                      if (onNavigate) onNavigate('player-dashboard');
                    } else {
                      if (onOpenAuthModal) onOpenAuthModal('player');
                    }
                  }}
                  className="login-dropdown-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'transparent',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: '18px' }}>⚽</span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 800, color: '#FFFFFF' }}>
                      {playerUser ? `Player Dashboard (${playerUser.name})` : 'Player Sign In (Dashboard and Voting)'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8E8E93', marginTop: '1px' }}>
                      Official TOTW/TOTT ballots &amp; profile
                    </span>
                  </div>
                </button>

                {/* Logged in User Management / Sign Out */}
                {(playerUser || cmsUser) && (
                  <>
                    <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />
                    {playerUser && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsLoginOpen(false);
                          if (onLogoutPlayer) onLogoutPlayer();
                          else if (onLogout) onLogout('player');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: 'transparent',
                          border: 'none',
                          color: '#FF453A',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 69, 58, 0.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span>🚪</span> Sign Out Player ({playerUser.name})
                      </button>
                    )}
                    {cmsUser && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsLoginOpen(false);
                          if (onLogoutCms) onLogoutCms();
                          else if (onLogout) onLogout('cms');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: 'transparent',
                          border: 'none',
                          color: '#FF453A',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 69, 58, 0.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span>🚪</span> Sign Out Manager
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Hamburger Menu Toggle Button for Small Screens */}
          <button
            type="button"
            className="hamburger-btn"
            onClick={() => {
              setIsMenuOpen(!isMenuOpen);
              setIsLoginOpen(false);
            }}
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
          </div>
        </div>
      )}
    </header>
  );
}
