import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function MatchReportModal({
  fixture,
  homeTeam,
  awayTeam,
  categoryKey,
  isCmsMode = false,
  cmsUser = null,
  onClose,
  onReportSaved,
}) {
  const existingReport = fixture?.report || {};
  const hasReport = Boolean(existingReport.content && existingReport.content.trim());

  const [isEditing, setIsEditing] = useState(!hasReport && isCmsMode);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Form fields
  const [title, setTitle] = useState(existingReport.title || '');
  const [content, setContent] = useState(existingReport.content || '');
  const [motm, setMotm] = useState(existingReport.motm || '');
  const [motmTeam, setMotmTeam] = useState(existingReport.motm_team || '');
  const [tacticalNotes, setTacticalNotes] = useState(existingReport.tactical_notes || '');
  const [attendance, setAttendance] = useState(existingReport.attendance || '');
  const [weather, setWeather] = useState(existingReport.weather || '');

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Compute fixture score and events summary
  let homeScore = 0;
  let awayScore = 0;
  const homeEvents = [];
  const awayEvents = [];

  if (fixture.walkover) {
    homeScore = fixture.walkover === fixture.home ? 3 : 0;
    awayScore = fixture.walkover === fixture.away ? 3 : 0;
  } else {
    (fixture.events || []).forEach((ev) => {
      const isHome = ev.teamId === fixture.home;
      if (ev.type === 'goal') {
        if (isHome) homeScore++;
        else awayScore++;
        (isHome ? homeEvents : awayEvents).push({ type: 'goal', text: `⚽ ${ev.player}${ev.minute ? ` (${ev.minute}')` : ''}${ev.assist ? ` [Ast: ${ev.assist}]` : ''}` });
      } else if (ev.type === 'penalty') {
        if (isHome) homeScore++;
        else awayScore++;
        (isHome ? homeEvents : awayEvents).push({ type: 'goal', text: `⚽ (P) ${ev.player}${ev.minute ? ` (${ev.minute}')` : ''}` });
      } else if (ev.type === 'owngoal') {
        if (isHome) awayScore++;
        else homeScore++;
        (isHome ? homeEvents : awayEvents).push({ type: 'owngoal', text: `⚠️ (OG) ${ev.player}${ev.minute ? ` (${ev.minute}')` : ''}` });
      } else if (ev.type === 'yellow') {
        (isHome ? homeEvents : awayEvents).push({ type: 'yellow', text: `🟨 ${ev.player}` });
      } else if (ev.type === 'red') {
        (isHome ? homeEvents : awayEvents).push({ type: 'red', text: `🟥 ${ev.player}` });
      }
    });
  }

  const homeSquad = (homeTeam?.players || []).filter((p) => !p.unknown && p.name && p.name.trim());
  const awaySquad = (awayTeam?.players || []).filter((p) => !p.unknown && p.name && p.name.trim());

  const allPlayers = [
    ...homeSquad.map((p) => ({ ...p, teamName: homeTeam?.name, teamId: homeTeam?.id })),
    ...awaySquad.map((p) => ({ ...p, teamName: awayTeam?.name, teamId: awayTeam?.id })),
  ];

  const handleQuickDraft = () => {
    const hName = homeTeam?.name || 'Home';
    const aName = awayTeam?.name || 'Away';
    const venueName = fixture.venue || 'Thoome Pri.';
    const dateStr = fixture.date || 'Matchday';

    // 1. Determine Match Outcome
    let outcome = 'battled to a competitive draw';
    let winningTeamName = null;
    let winningSquad = [];
    if (homeScore > awayScore) {
      outcome = `secured a commanding ${homeScore}-${awayScore} victory over ${aName}`;
      winningTeamName = hName;
      winningSquad = homeSquad;
    } else if (awayScore > homeScore) {
      outcome = `clinched a decisive ${awayScore}-${homeScore} triumph against ${hName}`;
      winningTeamName = aName;
      winningSquad = awaySquad;
    } else {
      outcome = `shared the points in a hard-fought ${homeScore}-${homeScore} draw`;
    }

    // 2. Extract Real Goalscorers, Assists, and Cards from Logged Events
    const realHomeScorers = [];
    const realAwayScorers = [];
    const realAssists = [];
    const realCards = [];

    (fixture.events || []).forEach((ev) => {
      if (!ev.player || ev.player === 'Unknown Player' || ev.player === 'Unrecorded scorer') return;
      const isHome = ev.teamId === fixture.home;
      const minStr = ev.minute ? ` (${ev.minute}')` : '';
      if (ev.type === 'goal' || ev.type === 'penalty') {
        const goalDesc = `${ev.player}${minStr}`;
        if (isHome) realHomeScorers.push(goalDesc);
        else realAwayScorers.push(goalDesc);
        if (ev.assist && ev.assist !== 'Unrecorded scorer') {
          realAssists.push(`${ev.assist} (assisted ${ev.player})`);
        }
      } else if (ev.type === 'owngoal') {
        const ogDesc = `${ev.player} (OG${minStr})`;
        if (isHome) realAwayScorers.push(ogDesc);
        else realHomeScorers.push(ogDesc);
      } else if (ev.type === 'yellow') {
        realCards.push(`${ev.player} (${isHome ? hName : aName} - 🟨)`);
      } else if (ev.type === 'red') {
        realCards.push(`${ev.player} (${isHome ? hName : aName} - 🟥)`);
      }
    });

    // 3. Select Man of the Match strictly from verified squad rosters
    let selectedMotm = motm;
    let selectedMotmTeam = motmTeam;
    if (!selectedMotm) {
      // Prioritize top scorer from winning side
      const winningGoalEvent = (fixture.events || []).find(
        (ev) => (ev.type === 'goal' || ev.type === 'penalty') &&
                ev.teamId === (homeScore > awayScore ? fixture.home : fixture.away) &&
                ev.player && ev.player !== 'Unrecorded scorer'
      );
      if (winningGoalEvent) {
        selectedMotm = winningGoalEvent.player;
        selectedMotmTeam = winningTeamName;
      } else if (winningSquad.length > 0) {
        selectedMotm = winningSquad[0].name;
        selectedMotmTeam = winningTeamName;
      } else if (homeSquad.length > 0) {
        selectedMotm = homeSquad[0].name;
        selectedMotmTeam = hName;
      } else if (awaySquad.length > 0) {
        selectedMotm = awaySquad[0].name;
        selectedMotmTeam = aName;
      }
    }

    if (selectedMotm) {
      setMotm(selectedMotm);
      if (selectedMotmTeam) setMotmTeam(selectedMotmTeam);
    }

    // 4. Construct Journalistic Story Paragraphs Using Real Names Only
    const p1 = `In an intense competitive fixture at ${venueName} (${dateStr}), ${hName} and ${aName} went head-to-head in front of vocal supporters. ${hName} ${outcome}. Both clubs demonstrated disciplined tactical execution from the opening whistle.`;

    let p2 = '';
    if (realHomeScorers.length > 0 || realAwayScorers.length > 0) {
      const parts = [];
      if (realHomeScorers.length > 0) {
        parts.push(`Goals for ${hName} came via ${realHomeScorers.join(', ')}`);
      }
      if (realAwayScorers.length > 0) {
        parts.push(`Goals for ${aName} were converted by ${realAwayScorers.join(', ')}`);
      }
      p2 = parts.join('. ') + '.';
      if (realAssists.length > 0) {
        p2 += ` Decisive playmaking delivery was provided by ${realAssists.join(', ')}.`;
      }
    } else {
      p2 = `Both defensive backlines held resolute throughout the ninety minutes, with goalkeepers and central defenders organizing their units effectively to deny clear-cut chances.`;
    }

    // Mention real squad leaders from both sides
    const hKeyPlayers = homeSquad.slice(0, 3).map((p) => p.name).join(', ');
    const aKeyPlayers = awaySquad.slice(0, 3).map((p) => p.name).join(', ');
    let p3 = '';
    if (hKeyPlayers && aKeyPlayers) {
      p3 = `Key contributions for ${hName} were anchored by ${hKeyPlayers}, while ${aName} looked dangerous through the efforts of ${aKeyPlayers}.`;
    } else if (hKeyPlayers) {
      p3 = `Tactical tempo for ${hName} was spearheaded by ${hKeyPlayers}.`;
    }

    // Disciplinary & Referee
    let p4 = '';
    if (realCards.length > 0) {
      p4 = `Disciplinary action was required during high-tempo duels, with cards recorded for: ${realCards.join(', ')}.`;
    }
    if (fixture.referee) {
      p4 += ` Match official ${fixture.referee} maintained firm authority throughout the encounter.`;
    }

    const draftTitle = `${hName} ${homeScore} - ${awayScore} ${aName}: Official Match Report`;
    const draftStory = [p1, p2, p3, p4].filter(Boolean).join('\n\n');

    // Tactical Notes
    const tacticalDraft = `• Formation & Tempo: High-tempo transitions between ${hName} and ${aName}.\n` +
      `• Key Standout: ${selectedMotm ? `${selectedMotm} (${selectedMotmTeam})` : 'Collective squad teamwork'}.\n` +
      `• Defensive Structure: Organized backline communication at ${venueName}.`;

    setTitle(draftTitle);
    setContent(draftStory);
    setTacticalNotes(tacticalDraft);
    if (!weather) setWeather('Warm, clear conditions · Thoome Primary Pitch');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Please provide match report narrative content.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg('');

    const payload = {
      title: title.trim() || `${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'} - Match Report`,
      content: content.trim(),
      motm: motm.trim(),
      motm_team: motmTeam.trim(),
      tactical_notes: tacticalNotes.trim(),
      attendance: attendance.trim(),
      weather: weather.trim(),
    };

    try {
      const res = await api.saveMatchReport(categoryKey, fixture.id, payload);
      setSuccessMsg('Match report saved successfully!');
      setIsEditing(false);
      if (onReportSaved) {
        onReportSaved(fixture.id, res.report || payload);
      }
    } catch (err) {
      setError(err.message || 'Failed to save match report.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="h2h-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target.className === 'h2h-overlay') onClose();
      }}
    >
      <div
        className="h2h-modal"
        style={{
          background: '#0B241C',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          color: '#FFFFFF',
          overflow: 'hidden',
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(180deg, #103328 0%, #0B241C 100%)',
          }}
        >
          <div>
            <div
              style={{
                color: '#FF9500',
                fontSize: '11px',
                fontWeight: '800',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              📝 OFFICIAL MATCH DAY REPORT &amp; DOSSIER
            </div>
            <h2
              className="scoreboard"
              style={{ margin: '2px 0 0', fontSize: '22px', color: '#FFFFFF' }}
            >
              FIXTURE {fixture.id} REPORT
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8E8E93',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* Match Score Banner */}
          <div
            style={{
              background: '#071C15',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {/* Home Team */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: homeTeam?.color || '#FF9500',
                    marginBottom: '4px',
                  }}
                />
                <div className="scoreboard" style={{ fontSize: '19px', color: '#FFFFFF' }}>
                  {homeTeam?.name || fixture.home}
                </div>
              </div>

              {/* Scoreline */}
              <div style={{ textAlign: 'center', padding: '0 16px' }}>
                <div
                  className="scoreboard"
                  style={{
                    fontSize: '32px',
                    color: fixture.played || fixture.walkover ? '#FF9F0A' : '#8E8E93',
                    letterSpacing: '0.08em',
                  }}
                >
                  {fixture.walkover ? (
                    fixture.walkover === fixture.home ? '3 - 0 (W/O)' : '0 - 3 (W/O)'
                  ) : (
                    `${homeScore} - ${awayScore}`
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '2px' }}>
                  {fixture.date} · {fixture.venue || 'Thoome Pri.'}
                </div>
              </div>

              {/* Away Team */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: awayTeam?.color || '#3B82F6',
                    marginBottom: '4px',
                  }}
                />
                <div className="scoreboard" style={{ fontSize: '19px', color: '#FFFFFF' }}>
                  {awayTeam?.name || fixture.away}
                </div>
              </div>
            </div>

            {/* Events Summary (Scorers & Cards) */}
            {(homeEvents.length > 0 || awayEvents.length > 0) && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px dashed rgba(255, 255, 255, 0.1)',
                  marginTop: '12px',
                  paddingTop: '10px',
                  fontSize: '11.5px',
                  color: '#D1D5DB',
                }}
              >
                <div style={{ flex: 1 }}>
                  {homeEvents.map((ev, i) => (
                    <div key={i}>{ev.text}</div>
                  ))}
                </div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  {awayEvents.map((ev, i) => (
                    <div key={i}>{ev.text}</div>
                  ))}
                </div>
              </div>
            )}

            {fixture.referee && (
              <div
                style={{
                  textAlign: 'center',
                  fontSize: '11px',
                  color: '#9CA3AF',
                  marginTop: '10px',
                }}
              >
                🧑‍⚖️ Match Referee: <strong>{fixture.referee}</strong>
              </div>
            )}
          </div>

          {/* Feedback Messages */}
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #EF4444',
                color: '#FCA5A5',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '12.5px',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10B981',
                color: '#6EE7B7',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '12.5px',
              }}
            >
              ✅ {successMsg}
            </div>
          )}

          {/* EDIT FORM (Admin mode) */}
          {isEditing && isCmsMode ? (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#FF9500' }}>
                  ✍️ COMPOSE MATCH REPORT
                </span>
                <button
                  type="button"
                  onClick={handleQuickDraft}
                  style={{
                    background: '#133E30',
                    border: '1px solid #FF9500',
                    color: '#FF9F0A',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  title="Auto-fill basic story framework based on match result"
                >
                  🪄 Draft Starter Framework
                </button>
              </div>

              {/* Title Input */}
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', color: '#9CA3AF', marginBottom: '4px' }}>
                  Report Headline / Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Electric Clash: Oxford Edge Masters in High-Octane Derby"
                  style={{
                    width: '100%',
                    background: '#071C15',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* MOTM & MOTM Team Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: '#9CA3AF', marginBottom: '4px' }}>
                    🌟 Man of the Match (MOTM)
                  </label>
                  <input
                    type="text"
                    list="fixture-player-candidates"
                    value={motm}
                    onChange={(e) => setMotm(e.target.value)}
                    placeholder="Select or enter player name"
                    style={{
                      width: '100%',
                      background: '#071C15',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      color: '#FFFFFF',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <datalist id="fixture-player-candidates">
                    {allPlayers.map((p, idx) => (
                      <option key={idx} value={p.name}>
                        {p.name} ({p.teamName} - {p.position || 'Player'})
                      </option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: '#9CA3AF', marginBottom: '4px' }}>
                    MOTM Team
                  </label>
                  <select
                    value={motmTeam}
                    onChange={(e) => setMotmTeam(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#071C15',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      color: '#FFFFFF',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">-- Select Team --</option>
                    {homeTeam && <option value={homeTeam.name}>{homeTeam.name}</option>}
                    {awayTeam && <option value={awayTeam.name}>{awayTeam.name}</option>}
                  </select>
                </div>
              </div>

              {/* Conditions & Attendance */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: '#9CA3AF', marginBottom: '4px' }}>
                    👥 Estimated Attendance
                  </label>
                  <input
                    type="text"
                    value={attendance}
                    onChange={(e) => setAttendance(e.target.value)}
                    placeholder="e.g. 150 spectators"
                    style={{
                      width: '100%',
                      background: '#071C15',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      color: '#FFFFFF',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: '#9CA3AF', marginBottom: '4px' }}>
                    🌤️ Weather &amp; Pitch Notes
                  </label>
                  <input
                    type="text"
                    value={weather}
                    onChange={(e) => setWeather(e.target.value)}
                    placeholder="e.g. Dry, clear evening, firm pitch"
                    style={{
                      width: '100%',
                      background: '#071C15',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      color: '#FFFFFF',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Story Content */}
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', color: '#9CA3AF', marginBottom: '4px' }}>
                  Match Story &amp; Narrative *
                </label>
                <textarea
                  rows={6}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Provide an editorial summary of the game, pivotal moments, key goals, midfield battles, and team performance..."
                  style={{
                    width: '100%',
                    background: '#071C15',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#FFFFFF',
                    fontSize: '12.5px',
                    lineHeight: '1.6',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                  required
                />
              </div>

              {/* Tactical Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', color: '#9CA3AF', marginBottom: '4px' }}>
                  Tactical Notes &amp; Observations (Optional)
                </label>
                <textarea
                  rows={3}
                  value={tacticalNotes}
                  onChange={(e) => setTacticalNotes(e.target.value)}
                  placeholder="Coaching notes, structural adjustments, pressing shape, referee decisions..."
                  style={{
                    width: '100%',
                    background: '#071C15',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#FFFFFF',
                    fontSize: '12.5px',
                    lineHeight: '1.5',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                {hasReport && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #3B6A56',
                      color: '#D1D5DB',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: '#FF9500',
                    border: 'none',
                    color: '#16201B',
                    borderRadius: '8px',
                    padding: '8px 20px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: saving ? 'wait' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : '💾 Save Official Report'}
                </button>
              </div>
            </form>
          ) : (
            /* VIEW MODE */
            <div>
              {hasReport ? (
                <div>
                  {/* Headline */}
                  <h3
                    style={{
                      fontSize: '20px',
                      fontWeight: 800,
                      color: '#FFFFFF',
                      marginBottom: '8px',
                      marginTop: 0,
                    }}
                  >
                    {existingReport.title || 'Official Match Report'}
                  </h3>

                  {/* Metadata Tagline */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      fontSize: '11px',
                      color: '#8E8E93',
                      marginBottom: '16px',
                      paddingBottom: '12px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <span>✍️ By: <strong>{existingReport.author || 'Match Official'}</strong></span>
                    {existingReport.attendance && (
                      <span>👥 Attendance: <strong>{existingReport.attendance}</strong></span>
                    )}
                    {existingReport.weather && (
                      <span>🌤️ Conditions: <strong>{existingReport.weather}</strong></span>
                    )}
                    {existingReport.updated_at && (
                      <span>🕒 {new Date(existingReport.updated_at).toLocaleDateString()}</span>
                    )}
                  </div>

                  {/* MOTM Spotlight */}
                  {existingReport.motm && (
                    <div
                      style={{
                        background: 'linear-gradient(135deg, rgba(255, 149, 0,0.18) 0%, rgba(11,36,28,0.4) 100%)',
                        border: '1px solid #FF9500',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>🌟</span>
                      <div>
                        <div style={{ fontSize: '10.5px', color: '#FF9F0A', textTransform: 'uppercase', fontWeight: 800 }}>
                          Official Man of the Match
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF' }}>
                          {existingReport.motm} {existingReport.motm_team && `(${existingReport.motm_team})`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Main Narrative */}
                  <div
                    style={{
                      fontSize: '13.5px',
                      lineHeight: '1.7',
                      color: '#E5E7EB',
                      whiteSpace: 'pre-line',
                      marginBottom: '18px',
                    }}
                  >
                    {existingReport.content}
                  </div>

                  {/* Tactical Observations */}
                  {existingReport.tactical_notes && (
                    <div
                      style={{
                        background: '#071C15',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderLeft: '4px solid #FF9500',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        marginBottom: '18px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: '#FF9500',
                          textTransform: 'uppercase',
                          marginBottom: '4px',
                        }}
                      >
                        📋 Tactical Observations &amp; Insights
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#D1D5DB', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                        {existingReport.tactical_notes}
                      </div>
                    </div>
                  )}

                  {/* Admin Edit Trigger */}
                  {isCmsMode && (
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        style={{
                          background: '#1C1C1E',
                          border: '1px solid #FF9500',
                          color: '#FF9500',
                          borderRadius: '8px',
                          padding: '7px 16px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        ✏️ Edit Match Report
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '36px 16px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', marginBottom: '6px' }}>
                    No Official Match Report Yet
                  </div>
                  <div style={{ fontSize: '12px', color: '#8E8E93', maxWidth: '420px', margin: '0 auto 16px' }}>
                    This match has finished, but no editorial match report has been written by administrators yet.
                  </div>
                  {isCmsMode ? (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      style={{
                        background: '#FF9500',
                        border: 'none',
                        color: '#16201B',
                        borderRadius: '8px',
                        padding: '9px 20px',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      ✍️ Write Match Report
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#071C15',
          }}
        >
          <a
            href={`/fixtures/${fixture.id}/sheet/`}
            target="_blank"
            rel="noreferrer"
            style={{
              color: '#8E8E93',
              fontSize: '11.5px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            📄 View Match Sheet
          </a>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1C1C1E',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#FFFFFF',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
