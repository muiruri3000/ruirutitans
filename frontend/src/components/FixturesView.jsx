import React, { useState } from 'react';

const EVENT_TYPES = [
  { key: 'goal', label: 'Goal', icon: '⚽' },
  { key: 'owngoal', label: 'Own Goal', icon: 'OG' },
  { key: 'assist', label: 'Assist', icon: '🅰️' },
  { key: 'yellow', label: 'Yellow', icon: '🟨' },
  { key: 'red', label: 'Red', icon: '🟥' },
];

export default function FixturesView({
  fixtures,
  teamsById,
  suspensions,
  referees,
  activeCategoryKey,
  onTogglePlayed,
  onAddEvent,
  onRemoveEvent,
  onSetWalkover,
  onSetReferee,
  onOpenH2H,
}) {
  const [openFixtureIds, setOpenFixtureIds] = useState({});
  const [pendingGoal, setPendingGoal] = useState({}); // fixtureId -> { scorerId, assistId, penalty }

  if (!fixtures || fixtures.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8FA89B' }}>
        No fixtures yet in this category — add teams under Manage and fixtures generate automatically.
      </div>
    );
  }

  const toggleOpen = (fId) => {
    setOpenFixtureIds((prev) => ({ ...prev, [fId]: !prev[fId] }));
  };

  return (
    <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '12px', padding: '12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          paddingBottom: '8px',
          borderBottom: '1px solid #1E4636',
        }}
      >
        <span style={{ fontWeight: 700, color: '#C9A227', fontSize: '13px', letterSpacing: '0.05em' }}>
          FIXTURES &amp; RESULTS
        </span>
        <a
          href={`/api/categories/${activeCategoryKey}/export/fixtures-csv/`}
          className="csv-export-btn"
          title="Download fixtures schedule and results as CSV"
        >
          📥 Export Fixtures CSV
        </a>
      </div>

      {fixtures.map((f) => {
        const home = teamsById[f.home];
        const away = teamsById[f.away];
        const isOpen = !!openFixtureIds[f.id];
        const suspendedList = (suspensions || {})[f.id] || [];

        // Compute scores
        let hs = 0, as = 0;
        if (f.walkover) {
          hs = f.walkover === f.home ? 3 : 0;
          as = f.walkover === f.away ? 3 : 0;
        } else {
          (f.events || []).forEach((e) => {
            if (e.type === 'goal' && e.teamId === f.home) hs++;
            else if (e.type === 'goal' && e.teamId === f.away) as++;
            else if (e.type === 'owngoal' && e.teamId === f.home) as++;
            else if (e.type === 'owngoal' && e.teamId === f.away) hs++;
          });
        }

        const homeScorers = [];
        const awayScorers = [];
        (f.events || []).forEach((e) => {
          if (e.type === 'goal') {
            const team = teamsById[e.teamId];
            const p = team?.players?.find((pp) => pp.id === e.playerId);
            const a = e.assistPlayerId ? team?.players?.find((pp) => pp.id === e.assistPlayerId) : null;
            const str = p ? p.name + (a ? ` (${a.name})` : '') : 'Goal';
            if (e.teamId === f.home) homeScorers.push(str);
            else awayScorers.push(str);
          } else if (e.type === 'owngoal') {
            const team = teamsById[e.teamId];
            const p = team?.players?.find((pp) => pp.id === e.playerId);
            const str = (p ? p.name : 'Player') + ' (OG)';
            if (e.teamId === f.home) awayScorers.push(str);
            else homeScorers.push(str);
          }
        });

        return (
          <div
            key={f.id}
            className="fixture-card"
            style={{ padding: '12px 4px', borderBottom: '1px solid #16352A' }}
          >
            {/* Date line */}
            <div style={{ textAlign: 'center', fontSize: '11px', color: '#6E9080', marginBottom: '2px' }}>
              {f.date}
            </div>

            {/* Scoreboard header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '4px', background: home?.color }} />
                <span style={{ fontWeight: 700, color: '#F4F2EA', fontSize: '14px' }}>{home?.name || 'TBD'}</span>
              </div>
              <div
                className="scoreboard"
                style={{
                  fontSize: '24px',
                  color: f.played ? '#C9A227' : '#8FA89B',
                  padding: '0 12px',
                  letterSpacing: '0.08em',
                }}
              >
                {f.played ? `${hs} - ${as}` : 'vs'}
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                <span style={{ fontWeight: 700, color: '#F4F2EA', fontSize: '14px' }}>{away?.name || 'TBD'}</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '4px', background: away?.color }} />
              </div>
            </div>

            {/* Referee line */}
            <div style={{ textAlign: 'center', fontSize: '11.5px', color: '#8FA89B', marginTop: '2px' }}>
              🧑‍⚖️{' '}
              <select
                value={f.referee || ''}
                onChange={(e) => onSetReferee(f.id, e.target.value)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#C9A227',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="" style={{ background: '#0F2E24', color: '#8FA89B' }}>
                  No referee assigned
                </option>
                {(referees || []).map((r, i) => (
                  <option key={i} value={r} style={{ background: '#0F2E24', color: '#F4F2EA' }}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Scorers Summary */}
            {(homeScorers.length > 0 || awayScorers.length > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8FA89B', padding: '4px 10px' }}>
                <div style={{ flex: 1 }}>{homeScorers.join(', ')}</div>
                <div style={{ flex: 1, textAlign: 'right' }}>{awayScorers.join(', ')}</div>
              </div>
            )}

            {/* Suspensions Line */}
            {suspendedList.length > 0 && (
              <div style={{ textAlign: 'center', fontSize: '11px', color: '#E24A3B', padding: '4px 0' }}>
                ⚠️ Suspended: {suspendedList.map((s) => `${s.playerName} (${teamsById[s.teamId]?.name || s.teamId})`).join(', ')}
              </div>
            )}

            {/* Action Buttons: Final, Events, H2H, Match Sheet */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <button
                className="played-toggle"
                onClick={() => onTogglePlayed(f.id)}
                style={{
                  background: f.played ? 'rgba(201,162,39,0.15)' : 'transparent',
                  borderColor: f.played ? '#C9A227' : '#2B4E40',
                  color: f.played ? '#C9A227' : '#8FA89B',
                }}
              >
                {f.played ? '✓ Final' : 'Mark Final'}
              </button>

              <button
                style={{ background: 'none', border: 'none', color: '#6E9080', fontSize: '11.5px', cursor: 'pointer' }}
                onClick={() => toggleOpen(f.id)}
              >
                {isOpen ? 'Hide events ▲' : 'Add events ▾'}
              </button>

              {home && away && (
                <button
                  className="btn-pill-action"
                  onClick={() => onOpenH2H(home.id, away.id)}
                  title="Head-to-head record and recent form comparison"
                >
                  ⚔️ H2H
                </button>
              )}

              <a
                href={`/fixtures/${f.id}/sheet/`}
                target="_blank"
                rel="noreferrer"
                className="btn-pill-action"
                title="Official Printable Match Day Team Sheet"
              >
                📄 Sheet
              </a>
            </div>

            {/* Expandable Match Events Panel */}
            {isOpen && (
              <div style={{ marginTop: '12px', background: '#082820', borderRadius: '8px', padding: '12px', border: '1px solid #1E4636' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#C9A227', marginBottom: '8px' }}>
                  RECORD MATCH EVENTS
                </div>

                {/* Existing event chips */}
                <div style={{ marginBottom: '10px' }}>
                  {(f.events || []).map((e, idx) => {
                    const t = teamsById[e.teamId];
                    const p = t?.players?.find((pp) => pp.id === e.playerId);
                    const label = `${p ? p.name : 'Unknown'} (${t?.name || e.teamId}) - ${e.type}`;
                    return (
                      <span key={idx} className="ev-chip">
                        <span>{e.type === 'goal' ? '⚽' : e.type === 'yellow' ? '🟨' : e.type === 'red' ? '🟥' : 'OG'}</span>
                        <span>{label}</span>
                        <span className="ev-remove" onClick={() => onRemoveEvent(f.id, idx)}>✕</span>
                      </span>
                    );
                  })}
                  {(!f.events || f.events.length === 0) && (
                    <span style={{ fontSize: '11px', color: '#6E9080' }}>No events logged yet.</span>
                  )}
                </div>

                {/* Quick Add Event form */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  {[home, away].filter(Boolean).map((team) => (
                    <div key={team.id} style={{ background: '#0F2E24', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#DDE6DF', marginBottom: '4px' }}>
                        {team.name}
                      </div>
                      <select
                        className="form-input"
                        style={{ fontSize: '11.5px', padding: '4px 6px', marginBottom: '4px' }}
                        onChange={(e) => {
                          const pId = e.target.value;
                          if (!pId) return;
                          onAddEvent(f.id, { teamId: team.id, playerId: pId, type: 'goal' });
                          e.target.value = '';
                        }}
                      >
                        <option value="">+ Goal (Select Scorer)</option>
                        {team.players.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>

                      <div style={{ display: 'flex', gap: '4px' }}>
                        <select
                          className="form-input"
                          style={{ fontSize: '11px', padding: '3px' }}
                          onChange={(e) => {
                            const pId = e.target.value;
                            if (!pId) return;
                            onAddEvent(f.id, { teamId: team.id, playerId: pId, type: 'yellow' });
                            e.target.value = '';
                          }}
                        >
                          <option value="">+ 🟨</option>
                          {team.players.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          className="form-input"
                          style={{ fontSize: '11px', padding: '3px' }}
                          onChange={(e) => {
                            const pId = e.target.value;
                            if (!pId) return;
                            onAddEvent(f.id, { teamId: team.id, playerId: pId, type: 'red' });
                            e.target.value = '';
                          }}
                        >
                          <option value="">+ 🟥</option>
                          {team.players.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Walkover choice */}
                <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#8FA89B' }}>
                  Walkover winner:{' '}
                  <button
                    className="stat-btn"
                    style={{ background: f.walkover === f.home ? '#C9A227' : '#16352A', color: f.walkover === f.home ? '#16201B' : '#DDE6DF' }}
                    onClick={() => onSetWalkover(f.id, f.walkover === f.home ? null : f.home)}
                  >
                    {home?.name || 'Home'} (3-0)
                  </button>{' '}
                  <button
                    className="stat-btn"
                    style={{ background: f.walkover === f.away ? '#C9A227' : '#16352A', color: f.walkover === f.away ? '#16201B' : '#DDE6DF' }}
                    onClick={() => onSetWalkover(f.id, f.walkover === f.away ? null : f.away)}
                  >
                    {away?.name || 'Away'} (3-0)
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

