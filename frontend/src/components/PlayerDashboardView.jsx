import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import PasswordInput from './PasswordInput';

export default function PlayerDashboardView({
  playerUser,
  currentCategory,
  onOpenVotingTab,
  onOpenTeamModal,
  onLogoutPlayer,
  onPlayerUpdated,
}) {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [pwSuccess, setPwSuccess] = useState(null);

  const [hasVotedActiveRound, setHasVotedActiveRound] = useState(false);
  const [activeRoundTitle, setActiveRoundTitle] = useState('Active Round');

  useEffect(() => {
    let mounted = true;
    async function checkVoting() {
      if (!playerUser) return;
      try {
        const catKey = playerUser.category_key || currentCategory?.id || 'open';
        const vData = await api.getVotingData(catKey, playerUser.player_id);
        if (mounted && vData) {
          if (vData.round?.title) setActiveRoundTitle(vData.round.title);
          const voted = Boolean(
            vData.has_voted ||
            vData.voter_has_voted ||
            vData.round?.voter_has_voted ||
            (vData.voted_round_ids && vData.round?.id && vData.voted_round_ids.includes(vData.round.id)) ||
            (vData.my_votes && Object.values(vData.my_votes).some((arr) => Array.isArray(arr) && arr.length > 0))
          );
          setHasVotedActiveRound(voted);
        }
      } catch {}
    }
    checkVoting();
    return () => {
      mounted = false;
    };
  }, [playerUser, currentCategory]);

  if (!playerUser) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8FA89B', background: '#0F2E24', borderRadius: '14px', border: '1px solid #1E4636' }}>
        Please sign in as a player to view your personal dashboard.
      </div>
    );
  }

  // Find player's team and stats
  const team = (currentCategory?.teams || []).find((t) => t.id === playerUser.team_id) || {
    id: playerUser.team_id,
    name: playerUser.team_name,
    color: playerUser.team_color || '#3F7A4E',
    players: [],
  };

  // Find player details in roster
  const playerInRoster = (team.players || []).find(
    (p) => p.id === playerUser.player_id || p.permanentId === playerUser.player_id || p.name === playerUser.name
  );

  // Compute goals, assists, cards from played fixtures
  let goalsCount = 0;
  let assistsCount = 0;
  let yellowsCount = 0;
  let redsCount = 0;
  const targetId = playerUser.player_id;
  const targetName = (playerUser.name || '').toLowerCase();

  const allFixtures = (currentCategory?.fixtures || []).concat(
    Object.values(currentCategory?.groupFixtures || {}).flat()
  );

  allFixtures.forEach((f) => {
    const isCompleted = Boolean(f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0));
    if (!isCompleted) return;
    (f.events || []).forEach((ev) => {
      const matchP = ev.playerId === targetId || (ev.name && ev.name.toLowerCase() === targetName);
      const matchA = ev.assistPlayerId === targetId || (ev.assistName && ev.assistName.toLowerCase() === targetName);
      if (matchP) {
        if (ev.type === 'goal') goalsCount++;
        if (ev.type === 'yellow') yellowsCount++;
        if (ev.type === 'red') redsCount++;
      }
      if (matchA) {
        assistsCount++;
      }
    });
  });

  // Check next upcoming fixture for this team
  const nextFixture = allFixtures.find((f) => {
    const isCompleted = Boolean(f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0));
    return !isCompleted && (f.home === team.id || f.away === team.id);
  });

  const isSuspended = redsCount > 0 || yellowsCount >= 4;

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newPw || newPw.length < 4) {
      setPwError('New password must be at least 4 characters long.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match.');
      return;
    }
    setPwLoading(true);
    setPwError(null);
    setPwSuccess(null);
    try {
      const res = await api.changePlayerPassword({
        username: playerUser.username,
        currentCode: currentPw,
        newPassword: newPw,
      });
      setPwSuccess('Password updated successfully!');
      if (onPlayerUpdated && res.player) {
        onPlayerUpdated(res.player);
      }
      setTimeout(() => {
        setShowPasswordModal(false);
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
        setPwSuccess(null);
      }, 1500);
    } catch (err) {
      setPwError(err.message || 'Failed to update password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Hero Welcome Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(15, 46, 36, 0.95) 0%, rgba(7, 31, 23, 0.95) 100%)',
          border: '1px solid #C9A227',
          borderRadius: '14px',
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: playerUser.team_color || '#3F7A4E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              border: '2px solid #C9A227',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            ⚽
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#C9A227', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                OFFICIAL PLAYER PORTAL
              </span>
              <span
                style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ADE80',
                  border: '1px solid #22C55E',
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                ✓ VERIFIED SQUAD MEMBER
              </span>
            </div>
            <h1 className="scoreboard" style={{ margin: '4px 0', fontSize: '32px', color: '#F4F2EA' }}>
              {playerUser.name}
            </h1>
            <div style={{ fontSize: '13px', color: '#8FA89B', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>@{playerUser.username}</span>
              <span>•</span>
              <span style={{ color: '#DDE6DF', fontWeight: 700 }}>{playerUser.team_name}</span>
              <span>•</span>
              <span
                style={{
                  background: '#16352A',
                  color: '#C9A227',
                  border: '1px solid #2B5746',
                  borderRadius: '4px',
                  padding: '1px 6px',
                  fontWeight: 800,
                  fontSize: '11px',
                }}
              >
                Pos: {playerUser.position || 'Unassigned'}
              </span>
              <span>•</span>
              <span>Permanent ID: <code style={{ color: '#6CE5A0', fontWeight: 700 }}>{playerUser.player_id}</code></span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="stat-btn"
            style={{ background: '#16352A', color: '#F4F2EA', border: '1px solid #2B5746' }}
            onClick={() => setShowPasswordModal(true)}
          >
            🔑 Change Password
          </button>
          <button
            type="button"
            className="stat-btn"
            style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#FCA5A5', border: '1px solid #EF4444' }}
            onClick={onLogoutPlayer}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Season Stats Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
        <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#8FA89B', textTransform: 'uppercase', fontWeight: 700 }}>Goals Scored</div>
          <div className="scoreboard" style={{ fontSize: '32px', color: '#4ADE80', marginTop: '4px' }}>
            {goalsCount}
          </div>
        </div>

        <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#8FA89B', textTransform: 'uppercase', fontWeight: 700 }}>Assists</div>
          <div className="scoreboard" style={{ fontSize: '32px', color: '#60A5FA', marginTop: '4px' }}>
            {assistsCount}
          </div>
        </div>

        <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#8FA89B', textTransform: 'uppercase', fontWeight: 700 }}>Yellow Cards</div>
          <div className="scoreboard" style={{ fontSize: '32px', color: '#FACC15', marginTop: '4px' }}>
            {yellowsCount}
          </div>
        </div>

        <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#8FA89B', textTransform: 'uppercase', fontWeight: 700 }}>Red Cards</div>
          <div className="scoreboard" style={{ fontSize: '32px', color: '#EF4444', marginTop: '4px' }}>
            {redsCount}
          </div>
        </div>

        <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#8FA89B', textTransform: 'uppercase', fontWeight: 700 }}>Discipline</div>
          <div style={{ marginTop: '8px' }}>
            {isSuspended ? (
              <span style={{ background: '#7F1D1D', color: '#FCA5A5', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 }}>
                🚫 Suspended
              </span>
            ) : (
              <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ADE80', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 }}>
                ✓ Match Eligible
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Next Match Card */}
        <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              ⏳ Next Team Fixture
            </span>
            <span style={{ fontSize: '11px', color: '#8FA89B' }}>{playerUser.team_name}</span>
          </div>

          {nextFixture ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: '#082018', border: '1px solid #1E4636', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: '#8FA89B', marginBottom: '4px' }}>
                  📅 {nextFixture.date} · 🧑‍⚖️ Ref: {nextFixture.referee || 'Assigned'}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#F4F2EA' }}>
                  {nextFixture.home === team.id ? 'HOME vs ' : 'AWAY @ '}
                  <span style={{ color: '#FCD34D' }}>
                    {nextFixture.home === team.id ? nextFixture.away : nextFixture.home}
                  </span>
                </div>
              </div>
              {onOpenTeamModal && (
                <button
                  type="button"
                  className="btn-pill-action"
                  onClick={() => onOpenTeamModal(team.id, playerUser.category_key)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  📊 View Full Team Stats &amp; Opposition Analytics
                </button>
              )}
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#8FA89B', fontSize: '12.5px' }}>
              🎉 All scheduled matches for <strong>{playerUser.team_name}</strong> have been completed for this season!
            </div>
          )}
        </div>

        {/* Voting & Honours Card */}
        <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              🗳️ Official Player Voting Ballot
            </span>
            <span style={{ fontSize: '11px', color: hasVotedActiveRound ? '#6CE5A0' : '#4ADE80', fontWeight: 700 }}>
              {hasVotedActiveRound ? `✓ Voted for ${activeRoundTitle}` : `● ${activeRoundTitle}`}
            </span>
          </div>

          <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: '#8FA89B', lineHeight: 1.5 }}>
            {hasVotedActiveRound
              ? `Your official player ballot for ${activeRoundTitle} has been recorded! Single-vote policy is in effect. The ballot form will reopen once next week's round begins.`
              : `As a registered player in ${currentCategory?.label || playerUser.category_key || 'your tournament'}, you have exclusive voting privileges to select the official Team of the Week (TOTW).`}
          </p>

          <button
            type="button"
            className="stat-btn"
            style={{
              background: hasVotedActiveRound ? '#16352A' : '#C9A227',
              color: hasVotedActiveRound ? '#6CE5A0' : '#16201B',
              border: hasVotedActiveRound ? '1px solid #2B5746' : 'none',
              fontWeight: 800,
              padding: '10px 16px',
              width: '100%',
              cursor: 'pointer',
            }}
            onClick={onOpenVotingTab}
          >
            {hasVotedActiveRound ? '🏆 View Team of the Week (Vote Submitted)' : '🗳️ Cast Official Ballot for Team of the Week'}
          </button>
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="h2h-overlay" onClick={(e) => { if (e.target.classList.contains('h2h-overlay')) setShowPasswordModal(false); }}>
          <div className="h2h-modal" style={{ maxWidth: '420px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #1E4636', paddingBottom: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#F4F2EA' }}>
                🔑 Update Account Password
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                style={{ background: 'none', border: 'none', color: '#8FA89B', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#DDE6DF', fontWeight: 700, marginBottom: '4px' }}>
                  Current Password (or temporary code)
                </label>
                <PasswordInput
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="Enter current password…"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#DDE6DF', fontWeight: 700, marginBottom: '4px' }}>
                  New Password (min. 4 characters)
                </label>
                <PasswordInput
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Enter new password…"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#DDE6DF', fontWeight: 700, marginBottom: '4px' }}>
                  Confirm New Password
                </label>
                <PasswordInput
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Re-enter new password…"
                  required
                />
              </div>

              {pwError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '6px', padding: '8px', color: '#FCA5A5', fontSize: '12px' }}>
                  {pwError}
                </div>
              )}

              {pwSuccess && (
                <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22C55E', borderRadius: '6px', padding: '8px', color: '#4ADE80', fontSize: '12px' }}>
                  {pwSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={pwLoading}
                className="stat-btn"
                style={{ background: '#22C55E', color: '#0A2016', fontWeight: 800, padding: '10px', marginTop: '6px' }}
              >
                {pwLoading ? 'Updating…' : 'Save New Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
