import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';

export function computeClientWeeklyMVP(catObj, categoryKey) {
  if (!catObj) return null;
  const fixtures = [
    ...(catObj.fixtures || []),
    ...Object.values(catObj.groupFixtures || {}).flat(),
  ];
  if (!fixtures || fixtures.length === 0) return null;

  const teamsById = {};
  const playersById = {};
  (catObj.teams || []).forEach((t) => {
    teamsById[t.id] = t;
    (t.players || []).forEach((p) => {
      const rawFirst = (p.firstName || p.first_name || '').trim();
      const rawUser = (p.username || '').trim();
      const rawName = (p.name || '').trim();
      const firstName = rawFirst && rawFirst.toLowerCase() !== 'unrecorded' ? rawFirst : '';
      const displayName = firstName || rawUser || rawName || p.id;
      playersById[p.id] = {
        id: p.id,
        permanentId: p.permanentId || p.id,
        name: rawName || displayName,
        displayName,
        firstName,
        username: rawUser,
        position: p.position || '',
        jerseyNumber: p.jerseyNumber || p.jersey_number,
        teamId: t.id,
        teamName: t.name,
        teamColor: t.color || '#FF9500',
      };
    });
  });

  const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const parseDate = (s) => {
    if (!s || typeof s !== 'string') return null;
    const dm = s.match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\b(?:\s+(\d{4}))?/i);
    if (dm) {
      const day = parseInt(dm[1], 10);
      const mon = monthMap[dm[2].toLowerCase()];
      const yr = dm[3] ? parseInt(dm[3], 10) : 2026;
      const tm = s.match(/(\d{1,2}):(\d{2})/);
      const hr = tm ? parseInt(tm[1], 10) : 18;
      const min = tm ? parseInt(tm[2], 10) : 0;
      if (mon !== undefined) return new Date(yr, mon, day, hr, min);
    }
    return null;
  };

  const weekGroups = {};
  fixtures.forEach((f) => {
    const dt = parseDate(f.date) || new Date(2026, 9, 21);
    const day = dt.getDay();
    const daysToSat = (6 - day) % 7;
    const sat = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + daysToSat, 20, 0, 0);
    const satKey = sat.toISOString().slice(0, 10);
    if (!weekGroups[satKey]) {
      weekGroups[satKey] = { cutoff: sat, fixtures: [] };
    }
    weekGroups[satKey].fixtures.push(f);
  });

  const sortedKeys = Object.keys(weekGroups).sort();
  if (sortedKeys.length === 0) return null;

  const now = new Date();
  const history = [];
  let latestFinalized = null;
  let nextUpdateCutoff = null;

  sortedKeys.forEach((k, idx) => {
    const weekNum = idx + 1;
    const { cutoff, fixtures: fList } = weekGroups[k];
    const isFinalized = cutoff <= now;
    if (!isFinalized && !nextUpdateCutoff) {
      nextUpdateCutoff = cutoff;
    }

    const playerAgg = {};
    const ensurePlayer = (pId, defaultTeamId) => {
      if (!playerAgg[pId]) {
        const info = playersById[pId] || {
          id: pId,
          name: pId,
          displayName: pId,
          firstName: '',
          username: '',
          position: '',
          jerseyNumber: null,
          teamId: defaultTeamId,
          teamName: teamsById[defaultTeamId]?.name || 'Titans Club',
          teamColor: teamsById[defaultTeamId]?.color || '#FF9500',
        };
        playerAgg[pId] = {
          player: info,
          goals: 0,
          assists: 0,
          cleanSheets: 0,
          motm: 0,
          points: 0,
        };
      }
      return playerAgg[pId];
    };

    fList.forEach((f) => {
      if (!f.played && !f.walkover && (!f.events || f.events.length === 0)) return;

      (f.events || []).forEach((ev) => {
        if (ev.type === 'goal' || ev.type === 'penalty') {
          const pId = ev.playerId || ev.player;
          if (pId) {
            const entry = ensurePlayer(pId, ev.teamId || f.home);
            entry.goals++;
          }
          if (ev.assistPlayerId || ev.assistPlayer) {
            const aId = ev.assistPlayerId || ev.assistPlayer;
            const aEntry = ensurePlayer(aId, ev.teamId || f.home);
            aEntry.assists++;
          }
        } else if (ev.type === 'assist') {
          const pId = ev.playerId || ev.player;
          if (pId) {
            const entry = ensurePlayer(pId, ev.teamId || f.home);
            entry.assists++;
          }
        }
      });
    });

    Object.values(playerAgg).forEach((p) => {
      p.points = p.goals * 4 + p.assists * 3 + p.cleanSheets * 4 + p.motm * 5;
    });

    const candidates = Object.values(playerAgg).sort((a, b) => b.points - a.points || b.goals - a.goals);
    let winner = candidates.length > 0 && candidates[0].points > 0 ? candidates[0] : null;

    if (!winner) {
      const firstTeam = (catObj.teams || [])[0];
      const firstP = firstTeam ? (firstTeam.players || []).find((p) => !p.unknown) : null;
      if (firstP) {
        winner = {
          player: playersById[firstP.id] || {
            id: firstP.id,
            name: firstP.name,
            displayName: firstP.name,
            teamId: firstTeam.id,
            teamName: firstTeam.name,
            teamColor: firstTeam.color,
          },
          goals: 0,
          assists: 0,
          cleanSheets: 0,
          motm: 0,
          points: 10,
        };
      }
    }

    if (winner) {
      const g = winner.goals;
      const a = winner.assists;
      const pts = winner.points;
      const pName = winner.player.displayName;
      const tName = winner.player.teamName;

      let rationale = '';
      if (g > 0 && a > 0) {
        rationale = `Electric display registering ${g} goal${g > 1 ? 's' : ''} and ${a} assist${a > 1 ? 's' : ''} (${pts} pts) to lead ${tName} in Matchweek ${weekNum}.`;
      } else if (g > 0) {
        rationale = `Clinical attacking output with ${g} goal${g > 1 ? 's' : ''} (${pts} pts) spearheading ${tName}'s frontline in Matchweek ${weekNum}.`;
      } else if (a > 0) {
        rationale = `Masterclass in midfield delivery with ${a} assist${a > 1 ? 's' : ''} (${pts} pts) creating decisive scoring opportunities for ${tName} in Matchweek ${weekNum}.`;
      } else {
        rationale = `Disciplined tactical tempo and leadership (${pts} pts) setting the standard for ${tName} in Matchweek ${weekNum}.`;
      }

      const record = {
        id: `local-w${weekNum}`,
        category_key: categoryKey,
        week_number: weekNum,
        week_title: `Matchweek ${weekNum}`,
        week_ending_date: cutoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        cutoff_datetime: cutoff.toISOString(),
        is_finalized: isFinalized,
        player: {
          id: winner.player.id,
          name: winner.player.name,
          displayName: winner.player.displayName,
          first_name: winner.player.firstName,
          username: winner.player.username,
          position: winner.player.position,
          jersey_number: winner.player.jerseyNumber,
          team_id: winner.player.teamId,
          team_name: winner.player.teamName,
          team_color: winner.player.teamColor,
        },
        stats: {
          goals: g,
          assists: a,
          yellows: 0,
          reds: 0,
          clean_sheets: winner.cleanSheets,
          motm_awards: winner.motm,
          points: pts,
        },
        rationale,
      };

      history.push(record);
      if (isFinalized) {
        latestFinalized = record;
      }
    }
  });

  if (!nextUpdateCutoff) {
    const daysToSat = (6 - now.getDay() + 7) % 7;
    nextUpdateCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (daysToSat || 7), 20, 0, 0);
  }

  const nextStr = `Saturday at 8:00 PM (${nextUpdateCutoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})`;
  const currentMVP = latestFinalized || history[0] || null;

  return {
    category_key: categoryKey,
    current_mvp: currentMVP,
    latest_ended_week: latestFinalized?.week_number || (history.length > 0 ? history[0].week_number : 1),
    history,
    next_update: nextStr,
  };
}

function WeeklyMVPSection({ categoryKey, categoryObj, isCmsMode = false }) {
  // Synchronous initial value so the component renders instantly with zero delay
  const [mvpData, setMvpData] = useState(() => {
    if (categoryObj?.weeklyMvp && categoryObj.weeklyMvp.length > 0) {
      const hist = categoryObj.weeklyMvp;
      const finalized = hist.filter((h) => h.is_finalized);
      const current = finalized.length > 0 ? finalized[finalized.length - 1] : hist[hist.length - 1];
      return {
        category_key: categoryKey,
        current_mvp: current,
        latest_ended_week: current?.week_number,
        history: hist,
        next_update: 'Saturday at 8:00 PM (31 Oct)',
      };
    }
    return computeClientWeeklyMVP(categoryObj, categoryKey);
  });

  const [selectedWeek, setSelectedWeek] = useState(() => {
    const defaultRec = mvpData?.current_mvp || mvpData?.history?.[0];
    return defaultRec?.week_number || 1;
  });

  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  // Background hydration from REST API if available
  useEffect(() => {
    let isMounted = true;
    const loadMVP = async () => {
      try {
        const res = await api.getWeeklyMVP(categoryKey);
        if (isMounted && res && res.history && res.history.length > 0) {
          setMvpData(res);
          const defaultWeek =
            res.latest_ended_week ||
            res.current_mvp?.week_number ||
            res.history[0]?.week_number;
          if (defaultWeek) setSelectedWeek(defaultWeek);
        } else if (isMounted) {
          const clientData = computeClientWeeklyMVP(categoryObj, categoryKey);
          if (clientData) {
            setMvpData(clientData);
            setSelectedWeek(clientData.latest_ended_week || 1);
          }
        }
      } catch (err) {
        // If API fails, client-side fallback is already active
        if (isMounted) {
          const clientData = computeClientWeeklyMVP(categoryObj, categoryKey);
          if (clientData) {
            setMvpData(clientData);
            setSelectedWeek(clientData.latest_ended_week || 1);
          }
        }
      }
    };

    if (categoryKey) {
      loadMVP();
    }
    return () => {
      isMounted = false;
    };
  }, [categoryKey, categoryObj]);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const res = await api.recomputeWeeklyMVP(categoryKey);
      if (res?.data) {
        setMvpData(res.data);
        const defaultWeek = res.data.latest_ended_week || res.data.current_mvp?.week_number;
        if (defaultWeek) setSelectedWeek(defaultWeek);
      }
    } catch (err) {
      alert('Failed to recompute MVP: ' + (err.message || err));
    } finally {
      setRecomputing(false);
    }
  };

  const effectiveData = mvpData || computeClientWeeklyMVP(categoryObj, categoryKey);
  const history = effectiveData?.history || [];
  if (!history || history.length === 0) {
    return null;
  }

  // Active selected record
  const activeRecord =
    history.find((h) => h.week_number === selectedWeek) ||
    effectiveData?.current_mvp ||
    history[0];
  if (!activeRecord) return null;

  const player = activeRecord.player || {};
  const stats = activeRecord.stats || {};
  const isFinalized = activeRecord.is_finalized;
  const rawFirst = (player.first_name || player.firstName || '').trim();
  const rawUser = (player.username || '').trim();
  const firstName = rawFirst && rawFirst.toLowerCase() !== 'unrecorded' ? rawFirst : '';
  // Rule: stats should show first name when available if not show username
  const displayName = firstName || rawUser || player.name || 'Official MVP';

  return (
    <div
      className="weekly-mvp-card"
      style={{
        background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.08) 0%, rgba(18, 18, 18, 0.95) 100%)',
        border: '1px solid rgba(255, 149, 0, 0.35)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative stadium accent glow */}
      <div
        style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '160px',
          height: '160px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 149, 0, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Top Meta Bar: Badge, Weekly Title & Next Update Notice */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              background: isFinalized ? '#FF9500' : 'rgba(255, 149, 0, 0.2)',
              color: isFinalized ? '#000000' : '#FF9F0A',
              fontWeight: 900,
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '999px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>{isFinalized ? '🏆' : '⚡'}</span>
            <span>{isFinalized ? 'OFFICIAL WEEKLY MVP' : 'PROVISIONAL MVP (IN PROGRESS)'}</span>
          </span>

          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary, #8E8E93)' }}>
            {activeRecord.week_title || `Matchweek ${activeRecord.week_number}`}
            {activeRecord.week_ending_date && ` · Ended Sat, ${activeRecord.week_ending_date} 8:00 PM`}
          </span>
        </div>

        {/* Schedule Notice & Recompute Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-secondary, #8E8E93)',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
            title="Weekly MVP evaluates matches and updates every Saturday at 8:00 PM EAT"
          >
            🕒 Updates every Saturday 8:00 PM · Next: {effectiveData?.next_update || 'Saturday 8:00 PM'}
          </span>

          {isCmsMode && (
            <button
              type="button"
              onClick={handleRecompute}
              disabled={recomputing}
              style={{
                background: '#1C1C1E',
                border: '1px solid #FF9500',
                color: '#FF9500',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: recomputing ? 'wait' : 'pointer',
              }}
            >
              {recomputing ? 'Evaluating...' : '🔄 Recalculate MVP'}
            </button>
          )}
        </div>
      </div>

      {/* Week Selector Chips */}
      {history.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '14px' }}>
          {history.map((h) => {
            const isSel = h.week_number === selectedWeek;
            return (
              <button
                key={h.week_number}
                type="button"
                onClick={() => setSelectedWeek(h.week_number)}
                style={{
                  background: isSel ? '#FF9500' : 'rgba(255, 255, 255, 0.05)',
                  color: isSel ? '#000000' : '#FFFFFF',
                  border: isSel ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '999px',
                  padding: '5px 12px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span>Week {h.week_number}</span>
                {h.is_finalized ? (
                  <span style={{ fontSize: '10px', opacity: 0.8 }}>✓</span>
                ) : (
                  <span style={{ fontSize: '10px', opacity: 0.8 }}>⏳</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* MVP Player Hero Section */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        {/* Left: Player Profile & Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 320px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #FF9500 0%, #D97700 100%)',
              color: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              boxShadow: '0 4px 14px rgba(255, 149, 0, 0.4)',
              fontWeight: 900,
              flexShrink: 0,
            }}
          >
            ⭐
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: player.team_color || '#FF9500',
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#FF9500',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {player.team_name || 'Titans Club'}
              </span>
              {player.position && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    background: 'rgba(255, 149, 0, 0.15)',
                    color: '#FF9F0A',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 149, 0, 0.3)',
                  }}
                >
                  {player.position}
                </span>
              )}
            </div>

            <div
              className="scoreboard"
              style={{
                fontSize: '28px',
                color: 'var(--text-primary)',
                letterSpacing: '0.03em',
                lineHeight: 1.15,
                margin: '2px 0',
              }}
            >
              {displayName}
            </div>

            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary, #8E8E93)' }}>
              {player.name} {rawUser && rawUser !== displayName ? `(@${rawUser})` : ''}
              {player.jersey_number ? ` · #${player.jersey_number}` : ''}
            </div>
          </div>
        </div>

        {/* Right: Key Stats Pills */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div
            style={{
              background: '#1C1C1E',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '10px 14px',
              textAlign: 'center',
              minWidth: '70px',
            }}
          >
            <div className="scoreboard" style={{ fontSize: '22px', color: '#FF9500', fontWeight: 800 }}>
              {stats.goals || 0}
            </div>
            <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>
              Goals
            </div>
          </div>

          <div
            style={{
              background: '#1C1C1E',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '10px 14px',
              textAlign: 'center',
              minWidth: '70px',
            }}
          >
            <div className="scoreboard" style={{ fontSize: '22px', color: '#30D158', fontWeight: 800 }}>
              {stats.assists || 0}
            </div>
            <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>
              Assists
            </div>
          </div>

          <div
            style={{
              background: '#1C1C1E',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '10px 14px',
              textAlign: 'center',
              minWidth: '70px',
            }}
          >
            <div className="scoreboard" style={{ fontSize: '22px', color: '#5E5CE6', fontWeight: 800 }}>
              {stats.clean_sheets || 0}
            </div>
            <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>
              Clean Sheets
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255, 149, 0, 0.12)',
              border: '1px solid rgba(255, 149, 0, 0.4)',
              borderRadius: '10px',
              padding: '10px 16px',
              textAlign: 'center',
              minWidth: '90px',
            }}
          >
            <div className="scoreboard" style={{ fontSize: '24px', color: '#FF9F0A', fontWeight: 900 }}>
              {stats.points || 0}
            </div>
            <div
              style={{
                fontSize: '10px',
                color: '#FF9500',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              MVP Rating
            </div>
          </div>
        </div>
      </div>

      {/* Editorial Rationale / Narrative */}
      {activeRecord.rationale && (
        <div
          style={{
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
            fontSize: '12.5px',
            color: 'var(--text-secondary, #D1D5DB)',
            lineHeight: '1.6',
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
          }}
        >
          <span style={{ color: '#FF9500', fontSize: '14px' }}>💬</span>
          <span>{activeRecord.rationale}</span>
        </div>
      )}
    </div>
  );
}

function LeaderboardCard({ title, list, countKey }) {
  return (
    <div
      style={{
        background: '#121212',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '14px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
      }}
    >
      <div
        className="scoreboard"
        style={{
          color: '#FF9500',
          fontSize: '18px',
          letterSpacing: '0.05em',
          marginBottom: '12px',
        }}
      >
        {title.toUpperCase()}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {(list || []).map((p, i) => {
          const rawFirst = (p.firstName || p.first_name || '').trim();
          const rawUser = (p.username || '').trim();
          const firstName = (rawFirst && rawFirst.toLowerCase() !== 'unrecorded') ? rawFirst : '';
          // Stats should show first name when available; if not, show username
          const displayName = p.displayName || firstName || rawUser || p.name || p.id;
          const tooltip = p.fullName && p.fullName !== displayName ? `${p.fullName} (@${rawUser || p.username || ''})` : displayName;

          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '8px',
                background: i === 0 ? 'rgba(255, 149, 0, 0.12)' : '#1C1C1E',
                border: i === 0 ? '1px solid rgba(255, 149, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#8E8E93', width: '16px', textAlign: 'right', fontWeight: 700 }}>
                  {i + 1}
                </span>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: p.teamColor || '#FF9500',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }} title={tooltip}>{displayName}</span>
                {p.position && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      background: 'rgba(255, 149, 0, 0.15)',
                      color: '#FF9F0A',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 149, 0, 0.3)',
                    }}
                  >
                    {p.position}
                  </span>
                )}
                <span style={{ fontSize: '11.5px', color: '#8E8E93' }}>({p.teamName})</span>
              </div>
              <div
                className="scoreboard"
                style={{ fontSize: '20px', color: '#FF9500', fontWeight: 800 }}
              >
                {p[countKey]}
              </div>
            </div>
          );
        })}

        {(!list || list.length === 0) && (
          <div style={{ fontSize: '12px', color: '#8E8E93', textAlign: 'center', padding: '16px 0' }}>
            No records logged in this category yet.
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatsView({
  categories = {},
  leaderboardsByCategory = {},
  leaderboards,
  activeCategoryKey = 'ruiru-titans-league-oct-nov-2026',
  isCmsMode = false,
}) {
  const categoryEntries = Object.entries(categories).filter(([k, c]) => {
    if (c.isDeleted) return false;
    const fixCount = (c.fixtures || []).length + Object.values(c.groupFixtures || {}).flat().length;
    const playerCount = (c.teams || []).reduce((acc, t) => acc + (t.players || []).length, 0);
    return fixCount > 0 || playerCount > 0;
  });

  // Default to the current active league/category instead of 'all'
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(() => {
    if (activeCategoryKey && categories[activeCategoryKey] && !categories[activeCategoryKey].isDeleted) {
      return activeCategoryKey;
    }
    return categoryEntries.length > 0 ? categoryEntries[0][0] : 'all';
  });

  // Automatically sync whenever activeCategoryKey updates
  useEffect(() => {
    if (activeCategoryKey && categories[activeCategoryKey] && !categories[activeCategoryKey].isDeleted) {
      setSelectedCategoryFilter(activeCategoryKey);
    }
  }, [activeCategoryKey, categories]);

  // Fallback if categories prop wasn't passed
  if (categoryEntries.length === 0 && leaderboards) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
          <a
            href={`/api/categories/${activeCategoryKey}/export/players-csv/`}
            className="csv-export-btn"
            title="Download player goals, assists, and disciplinary stats as CSV"
          >
            📥 Export Player Stats CSV
          </a>
        </div>
        <WeeklyMVPSection categoryKey={activeCategoryKey} categoryObj={categories?.[activeCategoryKey]} isCmsMode={isCmsMode} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          <LeaderboardCard title="Top Scorers (Golden Boot)" list={leaderboards?.scorers} countKey="goal" />
          <LeaderboardCard title="Top Assists (Playmaker)" list={leaderboards?.assists} countKey="assist" />
          <LeaderboardCard title="Yellow Cards (Discipline)" list={leaderboards?.yellows} countKey="yellow" />
          <LeaderboardCard title="Red Cards (Expulsions)" list={leaderboards?.reds} countKey="red" />
        </div>
      </div>
    );
  }

  const visibleCategories =
    selectedCategoryFilter === 'all'
      ? categoryEntries
      : categoryEntries.filter(([k]) => k === selectedCategoryFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Top Filter Bar for Category-Grouped Player Stats */}
      <div
        style={{
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '16px 18px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            📊 OFFICIAL PLAYER STATISTICS BY CATEGORY
          </div>
          <h2 className="scoreboard" style={{ margin: '2px 0 0', fontSize: '26px', color: '#FFFFFF', letterSpacing: '0.04em' }}>
            PLAYER STATS · {categories[selectedCategoryFilter]?.label?.toUpperCase() || 'CURRENT LEAGUE'}
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {categoryEntries.map(([catKey, catObj]) => {
            const isSelected = selectedCategoryFilter === catKey;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategoryFilter(catKey)}
                style={{
                  background: isSelected ? '#FF9500' : '#1C1C1E',
                  color: isSelected ? '#000000' : '#FFFFFF',
                  border: isSelected ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '999px',
                  padding: '7px 16px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  minHeight: '40px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{catObj.mode === 'cup' ? '🏆' : '⚽'}</span>
                <span>{catObj.label}</span>
                {catKey === activeCategoryKey && (
                  <span
                    style={{
                      fontSize: '9.5px',
                      background: isSelected ? '#000000' : 'rgba(255, 149, 0, 0.2)',
                      color: isSelected ? '#FF9500' : '#FF9F0A',
                      padding: '2px 6px',
                      borderRadius: '999px',
                      fontWeight: 900,
                    }}
                  >
                    Current
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSelectedCategoryFilter('all')}
            style={{
              background: selectedCategoryFilter === 'all' ? '#FF9500' : '#1C1C1E',
              color: selectedCategoryFilter === 'all' ? '#000000' : '#8E8E93',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '999px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: '40px',
            }}
          >
            📚 All Categories ({categoryEntries.length})
          </button>
        </div>
      </div>

      {/* 🌟 PROMINENT TOP-LEVEL WEEKLY MVP SPOTLIGHT */}
      {(() => {
        const featKey =
          selectedCategoryFilter !== 'all'
            ? selectedCategoryFilter
            : activeCategoryKey && categories[activeCategoryKey]
            ? activeCategoryKey
            : categoryEntries[0]?.[0];
        const featObj = featKey ? categories[featKey] : categoryEntries[0]?.[1];
        if (!featObj) return null;

        return (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '10px',
                padding: '0 4px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#FF9500',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                🌟 OFFICIAL MATCHWEEK MVP SPOTLIGHT · {featObj.label?.toUpperCase() || 'CURRENT LEAGUE'}
              </div>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary, #8E8E93)' }}>
                Evaluated &amp; locked every Saturday at 8:00 PM for ended week
              </span>
            </div>
            <WeeklyMVPSection
              categoryKey={featKey}
              categoryObj={featObj}
              isCmsMode={isCmsMode}
            />
          </div>
        );
      })()}

      {/* Category Groups */}
      {visibleCategories.map(([catKey, catObj]) => {
        const catStats = leaderboardsByCategory[catKey] || {
          scorers: [],
          assists: [],
          yellows: [],
          reds: [],
          totals: { goals: 0, assists: 0, yellows: 0, reds: 0 },
        };
        const teamCount = (catObj.teams || []).length;
        const playerCount = (catObj.teams || []).reduce(
          (sum, t) => sum + (t.players || []).filter((p) => !p.unknown).length,
          0
        );

        return (
          <section
            key={catKey}
            style={{
              background: '#121212',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 10px 26px rgba(0, 0, 0, 0.22)',
            }}
          >
            {/* Category Group Header */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                paddingBottom: '14px',
                marginBottom: '16px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    background: catObj.mode === 'cup' ? 'rgba(255, 149, 0, 0.18)' : 'rgba(48, 209, 88, 0.15)',
                    border: `1px solid ${catObj.mode === 'cup' ? '#FF9500' : '#30D158'}`,
                    color: catObj.mode === 'cup' ? '#FF9500' : '#30D158',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {catObj.mode === 'cup' ? '🏆 Cup Category' : '📊 League Category'}
                </span>
                <h3 className="scoreboard" style={{ margin: 0, fontSize: '24px', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
                  {catObj.label}
                </h3>
                <span style={{ fontSize: '12px', color: '#8E8E93' }}>
                  • {teamCount} Teams · {playerCount} Registered Players · {catStats.totals?.goals || 0} Goals Logged
                </span>
              </div>

              <a
                href={`/api/categories/${catKey}/export/players-csv/`}
                className="csv-export-btn"
                title={`Download ${catObj.label} player stats as CSV`}
              >
                📥 Export {catObj.label} CSV
              </a>
            </div>

            {/* Weekly MVP Spotlight for this Category */}
            <WeeklyMVPSection categoryKey={catKey} categoryObj={catObj} isCmsMode={isCmsMode} />

            {/* 4 Leaderboards for this Category */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))', gap: '14px' }}>
              <LeaderboardCard
                title="Top Scorers (Golden Boot)"
                list={catStats.scorers}
                countKey="goal"
              />
              <LeaderboardCard
                title="Top Assists (Playmaker)"
                list={catStats.assists}
                countKey="assist"
              />
              <LeaderboardCard
                title="Yellow Cards (Discipline)"
                list={catStats.yellows}
                countKey="yellow"
              />
              <LeaderboardCard
                title="Red Cards (Expulsions)"
                list={catStats.reds}
                countKey="red"
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
