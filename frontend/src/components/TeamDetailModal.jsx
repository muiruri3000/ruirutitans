import React, { useState, useEffect, useMemo } from 'react';
import { computeTeamProfile } from '../utils/teamAnalytics';

const POSITIONS = ['', 'GK', 'LB', 'CB', 'RB', 'CDM', 'CM', 'LW', 'RW', 'ST'];

export default function TeamDetailModal({
  teamId,
  categoryKey,
  category,
  allCategories,
  activeSuspensionsMap,
  onClose,
  onOpenH2H,
  onSelectTeam,
  onMovePlayer,
  onAddPlayers,
  isCmsMode = false,
}) {
  const [activeTab, setActiveTab] = useState('projections'); // 'projections' | 'matches' | 'squad' | 'suspensions'
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerPosition, setNewPlayerPosition] = useState('');
  const [newPlayerUsername, setNewPlayerUsername] = useState('');
  const [newPlayerPassword, setNewPlayerPassword] = useState('');
  const [addMsg, setAddMsg] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const profile = useMemo(() => {
    return computeTeamProfile(teamId, category, allCategories, activeSuspensionsMap);
  }, [teamId, category, allCategories, activeSuspensionsMap]);

  if (!profile || !profile.team) {
    return (
      <div className="h2h-overlay" onClick={(e) => { if (e.target.className === 'h2h-overlay') onClose(); }}>
        <div className="team-modal" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h3 style={{ color: '#EF4444', margin: '0 0 10px' }}>Team Information Not Found</h3>
          <p style={{ color: '#8FA89B', fontSize: '13px' }}>The requested team could not be loaded.</p>
          <button type="button" className="btn-pill-action" onClick={onClose} style={{ marginTop: '14px' }}>
            ✕ Close
          </button>
        </div>
      </div>
    );
  }

  const { team, roster, activeSuspensions, last20Matches, next5Fixtures, form, tournamentProjections } = profile;

  return (
    <div
      className="h2h-overlay"
      onClick={(e) => {
        if (e.target.className === 'h2h-overlay') onClose();
      }}
    >
      <div className="team-modal">
        {/* =========================================================
            HEADER: TEAM EMBLEM, NAME, COMPETITION, CLOSE BUTTON
           ========================================================= */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '1px solid #1E4636',
            paddingBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: team.color || '#C9A227',
                border: '3px solid #163E31',
                boxShadow: `0 0 16px ${team.color || '#C9A227'}55`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 900,
                color: '#FFFFFF',
                flexShrink: 0,
              }}
            >
              {team.name ? team.name.charAt(0).toUpperCase() : 'T'}
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2
                  className="scoreboard"
                  style={{
                    margin: 0,
                    fontSize: 'clamp(22px, 4vw, 30px)',
                    color: '#F4F2EA',
                    letterSpacing: '0.04em',
                  }}
                >
                  {team.name}
                </h2>
                <span
                  style={{
                    background: 'rgba(201, 162, 39, 0.15)',
                    color: '#C9A227',
                    border: '1px solid #C9A227',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '10.5px',
                    fontWeight: 800,
                  }}
                >
                  {profile.category.label}
                </span>
                {activeSuspensions.length > 0 && (
                  <span
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#EF4444',
                      border: '1px solid #EF4444',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '10.5px',
                      fontWeight: 800,
                    }}
                  >
                    🚫 {activeSuspensions.length} Suspended
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#8FA89B', marginTop: '3px' }}>
                Squad: <strong>{profile.squadSize} Players</strong> · Total Matches Recorded: <strong>{last20Matches.length + next5Fixtures.length}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Team Modal"
            style={{
              background: '#16352A',
              border: '1px solid #2B4E40',
              color: '#8FA89B',
              fontSize: '16px',
              cursor: 'pointer',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* =========================================================
            NAVIGATION TABS (MOBILE-FIRST SCROLLABLE)
           ========================================================= */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid #16352A',
            paddingBottom: '8px',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <button
            type="button"
            className="tab-btn"
            onClick={() => setActiveTab('projections')}
            style={{
              background: activeTab === 'projections' ? '#C9A227' : '#16352A',
              color: activeTab === 'projections' ? '#16201B' : '#DDE6DF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            📊 Tournament Projections &amp; Odds
          </button>
          <button
            type="button"
            className="tab-btn"
            onClick={() => setActiveTab('matches')}
            style={{
              background: activeTab === 'matches' ? '#C9A227' : '#16352A',
              color: activeTab === 'matches' ? '#16201B' : '#DDE6DF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            📅 Matches &amp; Form ({last20Matches.length} Past · {next5Fixtures.length} Next)
          </button>
          <button
            type="button"
            className="tab-btn"
            onClick={() => setActiveTab('squad')}
            style={{
              background: activeTab === 'squad' ? '#C9A227' : '#16352A',
              color: activeTab === 'squad' ? '#16201B' : '#DDE6DF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            👥 Squad Roster ({roster.length})
          </button>
          <button
            type="button"
            className="tab-btn"
            onClick={() => setActiveTab('suspensions')}
            style={{
              background: activeTab === 'suspensions' ? '#C9A227' : '#16352A',
              color: activeTab === 'suspensions' ? '#16201B' : '#DDE6DF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            🚫 Suspensions ({activeSuspensions.length})
          </button>
        </div>

        {/* =========================================================
            TAB 1: TOURNAMENT PROJECTIONS & PROBABILITY ENGINE
           ========================================================= */}
        {activeTab === 'projections' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                background: '#071F17',
                border: '1px solid #C9A227',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#C9A227', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    ⚡ DYNAMIC REAL-TIME PREDICTIVE INTELLIGENCE
                  </span>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#F4F2EA', marginTop: '2px' }}>
                    Tournament Progression &amp; Outcome Probabilities
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ADE80',
                    border: '1px solid #22C55E',
                    padding: '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  ⚡ Re-analyzed After Every Match &amp; Result
                </span>
              </div>

              <div style={{ fontSize: '11.5px', color: '#8FA89B', lineHeight: 1.5 }}>
                This analysis simulates the rest of the competition <strong>1,000 times</strong>, incorporating current standings, goal differential rates, remaining fixtures, and head-to-head records across all competing teams.
              </div>

              {/* Projections Display (League vs Cup) */}
              {tournamentProjections && tournamentProjections.mode === 'league' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }}>
                  {/* Status Banner */}
                  <div
                    style={{
                      background: tournamentProjections.isMathematicallyEliminated
                        ? 'rgba(239, 68, 68, 0.12)'
                        : 'rgba(201, 162, 39, 0.12)',
                      border: `1px solid ${tournamentProjections.isMathematicallyEliminated ? '#EF4444' : '#C9A227'}`,
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#8FA89B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Title Contention Status
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: tournamentProjections.isMathematicallyEliminated ? '#EF4444' : '#FCD34D' }}>
                        {tournamentProjections.titleStatus}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10.5px', color: '#8FA89B' }}>Projected Finish</div>
                      <div className="scoreboard" style={{ fontSize: '20px', color: '#C9A227' }}>
                        {tournamentProjections.projectedRank} ({tournamentProjections.projectedFinalPoints} Pts)
                      </div>
                    </div>
                  </div>

                  {tournamentProjections.isMathematicallyEliminated && tournamentProjections.titleEliminationReason && (
                    <div style={{ fontSize: '11.5px', color: '#EF4444', background: '#2B1414', padding: '8px 12px', borderRadius: '6px', border: '1px solid #7F1D1D' }}>
                      ⚠️ <strong>Mathematical Elimination:</strong> {tournamentProjections.titleEliminationReason}
                    </div>
                  )}

                  {/* Probability Gauges Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    {/* 1. Title / Champion % */}
                    <div style={{ background: '#09271E', border: '1px solid #1E4636', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#8FA89B', fontWeight: 700 }}>
                        🏆 League Champion Probability
                      </div>
                      <div className="scoreboard" style={{ fontSize: '28px', color: '#C9A227' }}>
                        {tournamentProjections.titleProbability}%
                      </div>
                      <div style={{ width: '100%', height: '6px', background: '#16352A', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${tournamentProjections.titleProbability}%`, height: '100%', background: '#C9A227', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>

                    {/* 2. Top 2 Finish % */}
                    <div style={{ background: '#09271E', border: '1px solid #1E4636', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#8FA89B', fontWeight: 700 }}>
                        🥈 Top 2 Finish Probability
                      </div>
                      <div className="scoreboard" style={{ fontSize: '28px', color: '#5CD685' }}>
                        {tournamentProjections.top2Probability}%
                      </div>
                      <div style={{ width: '100%', height: '6px', background: '#16352A', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${tournamentProjections.top2Probability}%`, height: '100%', background: '#5CD685', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>

                    {/* 3. Top 4 Finish % */}
                    <div style={{ background: '#09271E', border: '1px solid #1E4636', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#8FA89B', fontWeight: 700 }}>
                        🎖️ Top 4 Finish Probability
                      </div>
                      <div className="scoreboard" style={{ fontSize: '28px', color: '#60A5FA' }}>
                        {tournamentProjections.top4Probability}%
                      </div>
                      <div style={{ width: '100%', height: '6px', background: '#16352A', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${tournamentProjections.top4Probability}%`, height: '100%', background: '#60A5FA', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  </div>

                  {/* League Standing Breakdown */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11.5px', color: '#DDE6DF', background: '#0A241C', padding: '10px 14px', borderRadius: '8px' }}>
                    <div>Current Rank: <strong style={{ color: '#C9A227' }}>#{tournamentProjections.currentRank}</strong> of {tournamentProjections.totalTeams}</div>
                    <div>• Current Points: <strong>{tournamentProjections.currentPoints}</strong></div>
                    <div>• Remaining Games: <strong>{tournamentProjections.remaining}</strong></div>
                    <div>• Max Possible Points: <strong>{tournamentProjections.maxPossiblePoints}</strong></div>
                    <div>• Current Leader Points: <strong>{tournamentProjections.leaderPoints}</strong></div>
                  </div>
                </div>
              )}

              {/* Cup Competition Projections */}
              {tournamentProjections && tournamentProjections.mode === 'cup' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }}>
                  <div
                    style={{
                      background: tournamentProjections.isEliminated
                        ? 'rgba(239, 68, 68, 0.12)'
                        : 'rgba(201, 162, 39, 0.12)',
                      border: `1px solid ${tournamentProjections.isEliminated ? '#EF4444' : '#C9A227'}`,
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#8FA89B', textTransform: 'uppercase' }}>
                        Cup Tournament Status
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: tournamentProjections.isEliminated ? '#EF4444' : '#FCD34D' }}>
                        {tournamentProjections.titleStatus}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10.5px', color: '#8FA89B' }}>Current Stage</div>
                      <div className="scoreboard" style={{ fontSize: '18px', color: '#C9A227' }}>
                        {tournamentProjections.currentStageLabel}
                      </div>
                    </div>
                  </div>

                  {tournamentProjections.isEliminated && tournamentProjections.eliminationDetails && (
                    <div style={{ fontSize: '11.5px', color: '#EF4444', background: '#2B1414', padding: '8px 12px', borderRadius: '6px', border: '1px solid #7F1D1D' }}>
                      ❌ <strong>Cup Exit:</strong> {tournamentProjections.eliminationDetails}
                    </div>
                  )}

                  {!tournamentProjections.isEliminated && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                      {tournamentProjections.isGroupStage && (
                        <div style={{ background: '#09271E', border: '1px solid #1E4636', borderRadius: '10px', padding: '12px' }}>
                          <div style={{ fontSize: '10.5px', color: '#8FA89B', fontWeight: 700 }}>🛡️ Group Advance %</div>
                          <div className="scoreboard" style={{ fontSize: '26px', color: '#5CD685' }}>
                            {tournamentProjections.groupAdvanceProbability}%
                          </div>
                        </div>
                      )}
                      <div style={{ background: '#09271E', border: '1px solid #1E4636', borderRadius: '10px', padding: '12px' }}>
                        <div style={{ fontSize: '10.5px', color: '#8FA89B', fontWeight: 700 }}>⚔️ Semi-Finals %</div>
                        <div className="scoreboard" style={{ fontSize: '26px', color: '#60A5FA' }}>
                          {tournamentProjections.semiFinalProbability}%
                        </div>
                      </div>
                      <div style={{ background: '#09271E', border: '1px solid #1E4636', borderRadius: '10px', padding: '12px' }}>
                        <div style={{ fontSize: '10.5px', color: '#8FA89B', fontWeight: 700 }}>🎯 Grand Final %</div>
                        <div className="scoreboard" style={{ fontSize: '26px', color: '#A78BFA' }}>
                          {tournamentProjections.finalProbability}%
                        </div>
                      </div>
                      <div style={{ background: '#09271E', border: '1px solid #1E4636', borderRadius: '10px', padding: '12px' }}>
                        <div style={{ fontSize: '10.5px', color: '#8FA89B', fontWeight: 700 }}>🏆 Lift Cup %</div>
                        <div className="scoreboard" style={{ fontSize: '26px', color: '#C9A227' }}>
                          {tournamentProjections.cupWinnerProbability}%
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Form Metrics Summary Widget */}
            <div style={{ background: '#0B281F', border: '1px solid #1E4636', borderRadius: '12px', padding: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', marginBottom: '8px' }}>
                📈 Performance &amp; Form Metrics
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div style={{ background: '#082018', padding: '8px 10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: '#8FA89B' }}>Recent Form (Last 5)</div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    {form.badges.length > 0 ? (
                      form.badges.map((b, idx) => <span key={idx} className={`form-badge ${b}`}>{b}</span>)
                    ) : (
                      <span style={{ fontSize: '11px', color: '#6E9080' }}>No games played</span>
                    )}
                  </div>
                </div>
                <div style={{ background: '#082018', padding: '8px 10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: '#8FA89B' }}>Win Rate</div>
                  <div className="scoreboard" style={{ fontSize: '18px', color: '#5CD685' }}>{form.winRate}%</div>
                </div>
                <div style={{ background: '#082018', padding: '8px 10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: '#8FA89B' }}>Avg Goals Scored</div>
                  <div className="scoreboard" style={{ fontSize: '18px', color: '#F4F2EA' }}>{form.avgGoalsScored} / game</div>
                </div>
                <div style={{ background: '#082018', padding: '8px 10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: '#8FA89B' }}>Avg Goals Conceded</div>
                  <div className="scoreboard" style={{ fontSize: '18px', color: '#F4F2EA' }}>{form.avgGoalsConceded} / game</div>
                </div>
                <div style={{ background: '#082018', padding: '8px 10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: '#8FA89B' }}>Clean Sheets</div>
                  <div className="scoreboard" style={{ fontSize: '18px', color: '#C9A227' }}>{form.cleanSheets} ({form.cleanSheetPct}%)</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 2: MATCHES & FORM (LAST 20 & NEXT 5)
           ========================================================= */}
        {activeTab === 'matches' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* NEXT 5 UPCOMING FIXTURES */}
            <div style={{ background: '#082018', border: '1px solid #1E4636', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  ⏳ Next 5 Upcoming Fixtures
                </span>
                <span style={{ fontSize: '11px', color: '#8FA89B' }}>{next5Fixtures.length} scheduled</span>
              </div>

              {next5Fixtures.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: '#8FA89B', fontSize: '12px' }}>
                  No upcoming scheduled fixtures found for this team.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {next5Fixtures.map((f, idx) => (
                    <div
                      key={f.id || idx}
                      style={{
                        background: '#0F2E24',
                        border: '1px solid #1E4636',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10.5px', background: '#16352A', color: '#C9A227', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            {f.isHome ? 'HOME' : 'AWAY'}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: '#F4F2EA' }}>
                            {f.isHome ? `vs ${f.opponentName}` : `@ ${f.opponentName}`}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#8FA89B', marginTop: '2px' }}>
                          📅 {f.date} · 🧑‍⚖️ {f.referee} · {f.competitionName}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {onOpenH2H && (
                          <button
                            type="button"
                            className="btn-pill-action"
                            onClick={() => onOpenH2H(team.id, f.opponentId)}
                            title="Open Head-to-Head Clash Analysis"
                          >
                            ⚔️ H2H
                          </button>
                        )}
                        <a href={f.sheetUrl} target="_blank" rel="noreferrer" className="btn-pill-action">
                          📄 Sheet
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* LAST 20 MATCHES PLAYED */}
            <div style={{ background: '#082018', border: '1px solid #1E4636', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  📜 Last 20 Matches Played &amp; Results
                </span>
                <span style={{ fontSize: '11px', color: '#8FA89B' }}>Showing {last20Matches.length} past results</span>
              </div>

              {last20Matches.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#8FA89B', fontSize: '12px' }}>
                  No played matches on record yet for this team.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {last20Matches.map((m, idx) => (
                    <div
                      key={m.id || idx}
                      style={{
                        background: '#0F2E24',
                        border: '1px solid #1E4636',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#8FA89B' }}>
                        <span>📅 {m.date} · {m.competitionName}</span>
                        <span
                          style={{
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '10.5px',
                            background:
                              m.result === 'W'
                                ? 'rgba(34, 197, 94, 0.2)'
                                : m.result === 'D'
                                ? 'rgba(234, 179, 8, 0.2)'
                                : 'rgba(239, 68, 68, 0.2)',
                            color:
                              m.result === 'W'
                                ? '#4ADE80'
                                : m.result === 'D'
                                ? '#FACC15'
                                : '#F87171',
                          }}
                        >
                          {m.result === 'W' ? 'WIN' : m.result === 'D' ? 'DRAW' : 'LOSS'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.homeColor }} />
                          <span style={{ fontWeight: m.homeId === team.id ? 800 : 600, color: m.homeId === team.id ? '#FCD34D' : '#F4F2EA', fontSize: '13px' }}>
                            {m.homeName}
                          </span>
                        </div>
                        <div className="scoreboard" style={{ fontSize: '20px', color: '#C9A227', padding: '0 12px' }}>
                          {m.homeScore} - {m.awayScore}
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ fontWeight: m.awayId === team.id ? 800 : 600, color: m.awayId === team.id ? '#FCD34D' : '#F4F2EA', fontSize: '13px' }}>
                            {m.awayName}
                          </span>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.awayColor }} />
                        </div>
                      </div>

                      {/* Scorers Summary if available */}
                      {m.events && m.events.length > 0 && (
                        <div style={{ fontSize: '10.5px', color: '#8FA89B', borderTop: '1px solid #16352A', paddingTop: '4px', marginTop: '2px' }}>
                          {m.events
                            .filter((e) => e.type === 'goal')
                            .map((e, eIdx) => {
                              const p = (roster || []).find((pp) => pp.id === e.playerId);
                              const isOurGoal = e.teamId === team.id;
                              return (
                                <span key={eIdx} style={{ marginRight: '8px', color: isOurGoal ? '#6CE5A0' : '#8FA89B' }}>
                                  ⚽ {p?.name || e.playerId} ({e.teamId}){e.penalty ? ' [Pen]' : ''}
                                </span>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 3: SQUAD ROSTER & PERFORMANCE STATS
           ========================================================= */}
        {activeTab === 'squad' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase' }}>
                👥 {team.name} Full Squad Roster ({roster.length} Players)
              </div>
              <div style={{ fontSize: '11px', color: '#8FA89B' }}>
                Sorted by squad number · Includes goals, assists &amp; disciplinary records
              </div>
            </div>

            {/* Direct Add Player Form (for Managers / CMS mode) */}
            {onAddPlayers && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const raw = (newPlayerName || '').trim();
                  if (!raw) return;
                  const names = raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
                  if (!names.length) return;
                  onAddPlayers(
                    team.id,
                    names,
                    newPlayerPosition || '',
                    newPlayerUsername.trim(),
                    newPlayerPassword.trim()
                  );
                  setAddMsg(`✓ Added ${names.length} player(s) directly to ${team.name}!`);
                  setNewPlayerName('');
                  setNewPlayerUsername('');
                  setNewPlayerPassword('');
                  setTimeout(() => setAddMsg(''), 4000);
                }}
                style={{
                  background: '#08231B',
                  border: '1px solid #2B5746',
                  borderRadius: '10px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase' }}>
                    + Directly Add Player(s) to {team.name}
                  </span>
                  {addMsg && (
                    <span style={{ fontSize: '11px', color: '#6CE5A0', fontWeight: 700 }}>
                      {addMsg}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: '2 1 180px', padding: '6px 10px', fontSize: '12px' }}
                    placeholder="Player name (or comma-separated: John, Peter)"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    required
                  />
                  <select
                    className="form-input"
                    style={{ flex: '1 1 100px', padding: '6px 8px', fontSize: '12px' }}
                    value={newPlayerPosition}
                    onChange={(e) => setNewPlayerPosition(e.target.value)}
                  >
                    <option value="">-- Pos --</option>
                    {POSITIONS.filter(Boolean).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: '1 1 120px', padding: '6px 10px', fontSize: '12px' }}
                    placeholder="Username (optional)"
                    value={newPlayerUsername}
                    onChange={(e) => setNewPlayerUsername(e.target.value)}
                  />
                  <input
                    type="password"
                    className="form-input"
                    style={{ flex: '1 1 120px', padding: '6px 10px', fontSize: '12px' }}
                    placeholder="Initial password (or use 4-digit activation)"
                    value={newPlayerPassword}
                    onChange={(e) => setNewPlayerPassword(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="stat-btn"
                    style={{
                      background: '#C9A227',
                      color: '#16201B',
                      fontWeight: 800,
                      padding: '6px 14px',
                      fontSize: '12px',
                    }}
                  >
                    + Add to Team
                  </button>
                </div>
              </form>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #1E4636', borderRadius: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#F4F2EA' }}>
                <thead>
                  <tr style={{ background: '#0A241C', color: '#8FA89B', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>#</th>
                    <th style={{ padding: '8px 12px' }}>Player Name</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Pos</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Category</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>⚽ G</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>🅰️ A</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>🟨 Y</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>🟥 R</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Status</th>
                    {onMovePlayer && (category?.teams || []).length > 1 && (
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>⇄ Transfer</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((p, idx) => (
                    <tr
                      key={p.id || idx}
                      style={{
                        borderTop: '1px solid #16352A',
                        background: p.isSuspended
                          ? 'rgba(239, 68, 68, 0.08)'
                          : idx % 2 === 0
                          ? 'rgba(15, 46, 36, 0.4)'
                          : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px 12px', fontWeight: 800, color: '#C9A227' }}>
                        {p.number || idx + 1}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 700 }}>
                        {p.name}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {p.position ? (
                          <span
                            style={{
                              background:
                                p.position === 'GK'
                                  ? '#EAB308'
                                  : ['DEF', 'CB', 'LB', 'RB'].includes(p.position)
                                  ? '#3B82F6'
                                  : ['MID', 'CM', 'CDM', 'CAM', 'LM', 'RM'].includes(p.position)
                                  ? '#10B981'
                                  : '#EF4444',
                              color: '#10221B',
                              fontWeight: 800,
                              fontSize: '9.5px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {p.position}
                          </span>
                        ) : (
                          <span
                            style={{
                              background: '#2A3B34',
                              color: '#9CA3AF',
                              fontWeight: 600,
                              fontSize: '9.5px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: '#C9A227', fontWeight: 700 }}>
                        {p.category ? `Tier ${p.category}` : 'Standard'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 800, color: p.goals > 0 ? '#4ADE80' : '#8FA89B' }}>
                        {p.goals}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center', color: p.assists > 0 ? '#60A5FA' : '#8FA89B' }}>
                        {p.assists}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center', color: p.yellows > 0 ? '#FACC15' : '#8FA89B' }}>
                        {p.yellows}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center', color: p.reds > 0 ? '#EF4444' : '#8FA89B' }}>
                        {p.reds}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {p.isSuspended ? (
                          <span style={{ background: '#7F1D1D', color: '#FCA5A5', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                            🚫 Suspended
                          </span>
                        ) : (
                          <span style={{ color: '#4ADE80', fontSize: '10.5px', fontWeight: 700 }}>
                            ✓ Active
                          </span>
                        )}
                      </td>
                      {onMovePlayer && (category?.teams || []).length > 1 && (
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <select
                            value=""
                            onChange={(e) => {
                              const targetTeamId = e.target.value;
                              if (targetTeamId && targetTeamId !== team.id) {
                                onMovePlayer(team.id, targetTeamId, p.id, categoryKey);
                              }
                            }}
                            title={`Move ${p.name} to another team in ${category?.label || 'league'}`}
                            style={{
                              background: '#0B2920',
                              color: '#6CE5A0',
                              border: '1px solid #2B5746',
                              borderRadius: '4px',
                              fontSize: '10.5px',
                              padding: '2px 5px',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            <option value="" disabled>⇄ Move...</option>
                            {(category?.teams || [])
                              .filter((other) => other.id !== team.id)
                              .map((other) => (
                                <option key={other.id} value={other.id}>
                                  → {other.name}
                                </option>
                              ))}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 4: DISCIPLINARY & SUSPENSIONS
           ========================================================= */}
        {activeTab === 'suspensions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase' }}>
              🚫 Squad Disciplinary &amp; Active Suspensions
            </div>

            {activeSuspensions.length === 0 ? (
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid #22C55E',
                  borderRadius: '10px',
                  padding: '24px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>🛡️</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#4ADE80' }}>
                  Clean Disciplinary Record
                </div>
                <div style={{ fontSize: '12px', color: '#8FA89B', marginTop: '4px' }}>
                  No players are currently serving suspensions. Full squad is eligible for the next match.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '12px', color: '#EF4444', fontWeight: 700 }}>
                  The following {activeSuspensions.length} player(s) are barred from participating in the team&apos;s next fixture:
                </div>
                {activeSuspensions.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid #EF4444',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FCA5A5' }}>
                        🚫 {s.playerName}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#F87171', marginTop: '2px' }}>
                        Reason: <strong>{s.reason}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '11px', color: '#8FA89B' }}>
                      Serving suspension for: <br />
                      <strong style={{ color: '#F4F2EA' }}>{s.forFixture}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: '#0F2E24', padding: '12px', borderRadius: '8px', fontSize: '11px', color: '#8FA89B', lineHeight: 1.5 }}>
              📌 <strong>Ruiru Titans Disciplinary Rules:</strong>
              <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                <li>Accumulation of 4 yellow cards = automatic 1-match ban.</li>
                <li>Direct red card = automatic 1-match ban.</li>
                <li>Sideline interference by a player from another team = booking is enforced in their actual team&apos;s next fixture.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
