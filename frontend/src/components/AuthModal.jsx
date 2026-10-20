import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import PasswordInput from './PasswordInput';

export default function AuthModal({
  isOpen,
  initialMode = 'cms', // 'cms' | 'player'
  activeCategoryKey = 'open',
  onClose,
  onCmsSuccess,
  onPlayerSuccess,
}) {
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Admin Dashboard form state (always requires entering username & password)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Player form state (just player username and password)
  const [playerUsername, setPlayerUsername] = useState('');
  const [playerPassword, setPlayerPassword] = useState('');

  // First-time or post-reset password change state
  const [isChangePasswordStep, setIsChangePasswordStep] = useState(false);
  const [pendingPlayer, setPendingPlayer] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Player username lookup state
  const [showLookup, setShowLookup] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupSearched, setLookupSearched] = useState(false);

  const handleSearchPlayerName = async (queryStr) => {
    const q = typeof queryStr === 'string' ? queryStr : lookupQuery;
    if (!q.trim()) {
      setLookupResults([]);
      setLookupSearched(false);
      return;
    }
    setLookupLoading(true);
    setLookupSearched(true);
    try {
      const res = await api.lookupPlayerUsername(q.trim(), activeCategoryKey);
      setLookupResults(res || []);
    } catch {
      setLookupResults([]);
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    setMode(initialMode);
    setError(null);
    setIsChangePasswordStep(false);
    setPendingPlayer(null);
    setNewPassword('');
    setConfirmPassword('');
    setShowLookup(initialMode === 'lookup');
    setLookupQuery('');
    setLookupResults([]);
    setLookupSearched(false);
    if (isOpen) {
      setPassword('');
      setPlayerPassword('');
    }
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleCmsSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter your Admin username and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.loginCms(username.trim(), password);
      onCmsSuccess && onCmsSuccess(res.cms_user);
      onClose();
    } catch (err) {
      setError(err.message || 'Admin login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayerSubmit = async (e) => {
    e.preventDefault();
    if (!playerUsername.trim() || !playerPassword.trim()) {
      setError('Please enter both your player username and password or 4-digit code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.loginPlayer(playerUsername.trim(), playerPassword.trim(), activeCategoryKey);
      if (res.player?.must_change_password) {
        setPendingPlayer(res.player);
        setIsChangePasswordStep(true);
      } else {
        onPlayerSuccess && onPlayerSuccess(res.player);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Player login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword.trim()) {
      setError('Please enter a new password.');
      return;
    }
    if (newPassword.trim().length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.changePlayerPassword({
        username: pendingPlayer?.username || playerUsername.trim(),
        player_id: pendingPlayer?.player_id || pendingPlayer?.id,
        currentCode: playerPassword.trim(),
        newPassword: newPassword.trim(),
      });
      onPlayerSuccess && onPlayerSuccess(res.player);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="h2h-overlay"
      onClick={(e) => {
        if (e.target.classList.contains('h2h-overlay')) onClose();
      }}
    >
      <div className="h2h-modal" style={{ maxWidth: '460px', padding: '26px' }}>
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '1px solid #1E4636',
            paddingBottom: '14px',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src={(typeof window !== 'undefined' && window.CLUB_LOGO_URL) || '/club-logo.jpg'}
              alt="Ruiru Titans"
              style={{ width: '42px', height: '42px', borderRadius: '8px', objectFit: 'contain' }}
            />
            <div>
              <div
                style={{
                  color: '#C9A227',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                RUIRU TITANS FC PORTAL
              </div>
              <h2 className="scoreboard" style={{ margin: '2px 0 0', fontSize: '26px', color: '#F4F2EA' }}>
                {mode === 'cms' ? 'MANAGER DASHBOARD SIGN IN' : mode === 'lookup' ? 'FIND PLAYER USERNAME' : 'PLAYER VOTING SIGN IN'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            style={{
              background: 'none',
              border: 'none',
              color: '#8FA89B',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Role Switcher Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            background: '#08231B',
            padding: '5px',
            borderRadius: '10px',
            border: '1px solid #1E4636',
            marginBottom: '18px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode('player');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '9px 10px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '11.5px',
              background: mode === 'player' ? '#C9A227' : 'transparent',
              color: mode === 'player' ? '#16201B' : '#8FA89B',
            }}
          >
            ⚽ Player Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('lookup');
              setError(null);
              setLookupSearched(false);
              setLookupResults([]);
            }}
            style={{
              flex: 1,
              padding: '9px 10px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '11.5px',
              background: mode === 'lookup' ? '#C9A227' : 'transparent',
              color: mode === 'lookup' ? '#16201B' : '#8FA89B',
            }}
          >
            🔍 Find Username
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('cms');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '9px 10px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '11.5px',
              background: mode === 'cms' ? '#C9A227' : 'transparent',
              color: mode === 'cms' ? '#16201B' : '#8FA89B',
            }}
          >
            🛠️ Manager Dashboard
          </button>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(226, 74, 59, 0.16)',
              border: '1px solid #E24A3B',
              color: '#FF9990',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              marginBottom: '16px',
              fontWeight: 600,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {mode === 'cms' ? (
          <form onSubmit={handleCmsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '12.5px', color: '#8FA89B', lineHeight: 1.5 }}>
              Enter your credentials to access the <strong>Manager Dashboard</strong> to manage league &amp; cup competitions, record live match events, update rosters, and control voting settings.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#DDE6DF', marginBottom: '5px' }}>
                Username
              </label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username…"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#DDE6DF', marginBottom: '5px' }}>
                Password
              </label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password…"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: '#C9A227',
                color: '#16201B',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '4px',
              }}
            >
              {loading ? 'Signing in to Manager Dashboard…' : '🔐 Sign In & Enter Manager Dashboard'}
            </button>
          </form>
        ) : isChangePasswordStep ? (
          <form onSubmit={handlePasswordChangeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                background: 'rgba(201, 162, 39, 0.15)',
                border: '1px solid #C9A227',
                borderRadius: '8px',
                padding: '12px',
                color: '#F4F2EA',
                fontSize: '12.5px',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 800, color: '#FCD34D', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔑</span> First-Time Activation / Password Reset Required
              </div>
              Welcome, <strong>{pendingPlayer?.name}</strong> ({pendingPlayer?.team_name})! You signed in using a temporary 4-digit code. Please set your permanent password to unlock your <strong>Player Dashboard</strong>.
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '6px', padding: '10px', color: '#FCA5A5', fontSize: '12px' }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#DDE6DF', marginBottom: '5px' }}>
                Create New Password (min. 4 characters)
              </label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new personal password…"
                required
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#DDE6DF', marginBottom: '5px' }}>
                Confirm New Password
              </label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new personal password…"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: '#22C55E',
                color: '#0A2016',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '4px',
              }}
            >
              {loading ? 'Setting Password…' : '🔒 Set Password & Open Player Dashboard'}
            </button>
          </form>
        ) : mode === 'lookup' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '12.5px', color: '#8FA89B', lineHeight: 1.5 }}>
              Forgot your player username? Enter your name or squad jersey number below to retrieve your official account username.
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Type your player name or jersey number (e.g. Kibe, #10, Caleb)…"
                value={lookupQuery}
                onChange={(e) => {
                  setLookupQuery(e.target.value);
                  handleSearchPlayerName(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchPlayerName(lookupQuery);
                  }
                }}
                autoFocus
                style={{ fontSize: '13px' }}
              />
              <button
                type="button"
                onClick={() => handleSearchPlayerName(lookupQuery)}
                disabled={lookupLoading}
                style={{
                  background: '#C9A227',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {lookupLoading ? 'Searching…' : '🔍 Search'}
              </button>
            </div>

            {lookupSearched && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                {lookupResults.length === 0 ? (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid #EF4444',
                      borderRadius: '8px',
                      padding: '12px',
                      color: '#FCA5A5',
                      fontSize: '12px',
                      textAlign: 'center',
                    }}
                  >
                    No player matching &ldquo;{lookupQuery}&rdquo; found. Please check spelling or contact your team manager.
                  </div>
                ) : (
                  lookupResults.map((p, idx) => (
                    <div
                      key={`${p.username}-${p.team_id}-${idx}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#092118',
                        border: '1px solid #2B5746',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        gap: '10px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#F4F2EA', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{p.name}</span>
                          {p.jersey_number != null && (
                            <span
                              style={{
                                fontSize: '10px',
                                color: '#C9A227',
                                background: 'rgba(201,162,39,0.18)',
                                border: '1px solid #C9A227',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontWeight: 800,
                              }}
                            >
                              #{p.jersey_number}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '10px',
                              color: '#6CE5A0',
                              background: 'rgba(108,229,160,0.15)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {p.position || 'CM'}
                          </span>
                          {p.is_active === false && (
                            <span
                              style={{
                                fontSize: '9px',
                                color: '#FCA5A5',
                                background: 'rgba(239,68,68,0.25)',
                                border: '1px solid #EF4444',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontWeight: 800,
                              }}
                            >
                              ⛔ Disabled
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#8FA89B', marginTop: '2px' }}>
                          Team: <strong>{p.team_name}</strong> · Username:{' '}
                          <span style={{ color: '#6CE5A0', fontWeight: 800, fontSize: '12px' }}>
                            @{p.username}
                          </span>
                        </div>
                      </div>
                      {p.is_active === false ? (
                        <span style={{ fontSize: '11px', color: '#FF9990', fontStyle: 'italic' }}>
                          Account Disabled
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPlayerUsername(p.username);
                            setMode('player');
                            setShowLookup(false);
                          }}
                          style={{
                            background: '#22C55E',
                            color: '#082015',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          ✓ Sign In With @{p.username} →
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {!lookupSearched && (
              <div style={{ fontSize: '11.5px', color: '#6E9080', textAlign: 'center', padding: '12px 0' }}>
                💡 Tip: Type any part of your first or last name, or your squad jersey number (e.g. 10) to see your registered player username.
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handlePlayerSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '12.5px', color: '#8FA89B', lineHeight: 1.5 }}>
              Sign in with your <strong>Player Username</strong> and <strong>Password or 4-digit code</strong>. Your system-assigned permanent Player ID will automatically be linked for voting, records, and your player dashboard.
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '6px', padding: '10px', color: '#FCA5A5', fontSize: '12px' }}>
                {error}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#DDE6DF' }}>
                  Player Username
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowLookup(!showLookup);
                    if (!showLookup) {
                      setLookupQuery('');
                      setLookupResults([]);
                      setLookupSearched(false);
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6CE5A0',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {showLookup ? '✕ Close Search' : '🔍 Forgot username? Find it here'}
                </button>
              </div>

              {showLookup && (
                <div
                  style={{
                    background: '#092118',
                    border: '1px solid #2B5746',
                    borderRadius: '8px',
                    padding: '10px',
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ fontSize: '11.5px', color: '#C9A227', fontWeight: 800, marginBottom: '6px' }}>
                    Type your name or jersey number to find your username:
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Kibe, #10, Caleb…"
                      value={lookupQuery}
                      onChange={(e) => {
                        setLookupQuery(e.target.value);
                        handleSearchPlayerName(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchPlayerName(lookupQuery);
                        }
                      }}
                      autoFocus
                      style={{ fontSize: '12px', padding: '6px 10px' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSearchPlayerName(lookupQuery)}
                      disabled={lookupLoading}
                      style={{
                        background: '#C9A227',
                        color: '#16201B',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {lookupLoading ? '…' : 'Find'}
                    </button>
                  </div>
                  {lookupSearched && (
                    <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {lookupResults.length === 0 ? (
                        <div style={{ fontSize: '11px', color: '#FF9990' }}>No match found.</div>
                      ) : (
                        lookupResults.map((p, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: '#113328',
                              padding: '5px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            <span style={{ fontSize: '11.5px', color: '#F4F2EA', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>{p.name}</span>
                              {p.jersey_number != null && (
                                <span style={{ color: '#C9A227', fontSize: '10px', fontWeight: 800 }}>
                                  #{p.jersey_number}
                                </span>
                              )}
                              <span style={{ color: '#8FA89B', fontSize: '10px' }}>({p.team_name}):</span>
                              <strong style={{ color: '#6CE5A0' }}>@{p.username}</strong>
                              {p.is_active === false && (
                                <span style={{ color: '#FCA5A5', fontSize: '9.5px', fontWeight: 800 }}>
                                  [Disabled]
                                </span>
                              )}
                            </span>
                            {p.is_active === false ? (
                              <span style={{ fontSize: '10px', color: '#FF9990', fontStyle: 'italic' }}>
                                Disabled
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setPlayerUsername(p.username);
                                  setShowLookup(false);
                                }}
                                style={{
                                  background: '#22C55E',
                                  color: '#082015',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                  fontSize: '10.5px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                }}
                              >
                                Use
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <input
                type="text"
                className="form-input"
                value={playerUsername}
                onChange={(e) => setPlayerUsername(e.target.value)}
                placeholder="Enter your player username (e.g. pato or kibe)…"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#DDE6DF', marginBottom: '5px' }}>
                Password or 4-Digit Activation Code
              </label>
              <PasswordInput
                value={playerPassword}
                onChange={(e) => setPlayerPassword(e.target.value)}
                placeholder="Enter your password or 4-digit code…"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: '#C9A227',
                color: '#16201B',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '4px',
              }}
            >
              {loading ? 'Signing In…' : '⚽ Sign In as Player'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
