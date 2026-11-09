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
  const playersByName = {};
  (catObj.teams || []).forEach((t) => {
    teamsById[t.id] = t;
    (t.players || []).forEach((p) => {
      const rawFirst = (p.firstName || p.first_name || '').trim();
      const rawUser = (p.username || '').trim();
      const rawName = (p.name || '').trim();
      const firstName = rawFirst && rawFirst.toLowerCase() !== 'unrecorded' ? rawFirst : '';
      const displayName = firstName || rawUser || rawName || p.id;
      const pInfo = {
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
      playersById[p.id] = pInfo;
      if (p.name) playersByName[p.name.toLowerCase().trim()] = pInfo;
      if (displayName) playersByName[displayName.toLowerCase().trim()] = pInfo;
      if (rawFirst) playersByName[rawFirst.toLowerCase()] = pInfo;
      if (rawUser) playersByName[rawUser.toLowerCase()] = pInfo;
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
    const ensurePlayer = (pIdOrName, defaultTeamId) => {
      const keyStr = String(pIdOrName || '').trim();
      const info = playersById[keyStr] || playersByName[keyStr.toLowerCase()] || {
        id: keyStr,
        name: keyStr,
        displayName: keyStr,
        firstName: '',
        username: '',
        position: '',
        jerseyNumber: null,
        teamId: defaultTeamId,
        teamName: teamsById[defaultTeamId]?.name || 'Titans Club',
        teamColor: teamsById[defaultTeamId]?.color || '#FF9500',
      };
      const canonicalId = info.id || keyStr;
      if (!playerAgg[canonicalId]) {
        playerAgg[canonicalId] = {
          player: info,
          goals: 0,
          assists: 0,
          cleanSheets: 0,
          motm: 0,
          points: 0,
        };
      }
      return playerAgg[canonicalId];
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
          if (ev.assistPlayerId || ev.assistPlayer || ev.assist) {
            const aId = ev.assistPlayerId || ev.assistPlayer || ev.assist;
            const aEntry = ensurePlayer(aId, ev.teamId || f.home);
            aEntry.assists++;
          }
        } else if (ev.type === 'assist') {
          const pId = ev.playerId || ev.player || ev.assistPlayerId || ev.assistPlayer;
          if (pId) {
            const entry = ensurePlayer(pId, ev.teamId || f.home);
            entry.assists++;
          }
        }
      });

      // Clean sheet calculation for client MVP
      let homeScore = 0;
      let awayScore = 0;
      if (typeof f.homeScore === 'number' && typeof f.awayScore === 'number') {
        homeScore = f.homeScore;
        awayScore = f.awayScore;
      } else if (Array.isArray(f.score) && f.score.length === 2) {
        homeScore = parseInt(f.score[0], 10) || 0;
        awayScore = parseInt(f.score[1], 10) || 0;
      } else if (f.events) {
        f.events.forEach((ev) => {
          if (ev.type === 'goal' || ev.type === 'penalty') {
            if (ev.teamId === f.home || ev.team === f.home) homeScore++;
            else if (ev.teamId === f.away || ev.team === f.away) awayScore++;
          }
        });
      }

      const FORWARD_POSITIONS = new Set(['ST', 'CF', 'LW', 'RW', 'FWD', 'ATT', 'FORWARD', 'STRIKER']);
      if (f.played || (f.events && f.events.length > 0)) {
        if (awayScore === 0 && f.home && teamsById[f.home]) {
          (teamsById[f.home].players || []).forEach((p) => {
            const pos = String(p.position || '').trim().toUpperCase();
            if (!p.unknown && !p.is_unknown && !FORWARD_POSITIONS.has(pos)) {
              const entry = ensurePlayer(p.id, f.home);
              entry.cleanSheets++;
            }
          });
        }
        if (homeScore === 0 && f.away && teamsById[f.away]) {
          (teamsById[f.away].players || []).forEach((p) => {
            const pos = String(p.position || '').trim().toUpperCase();
            if (!p.unknown && !p.is_unknown && !FORWARD_POSITIONS.has(pos)) {
              const entry = ensurePlayer(p.id, f.away);
              entry.cleanSheets++;
            }
          });
        }
      }
    });

    Object.values(playerAgg).forEach((p) => {
      p.points = p.goals * 4 + p.assists * 3 + p.cleanSheets * 4 + p.motm * 5;
    });

    const candidates = Object.values(playerAgg).sort((a, b) => b.points - a.points || b.goals - a.goals);
    const winner = candidates.length > 0 && candidates[0].points > 0 ? candidates[0] : null;

    if (!winner) {
      // Matchweek has not yet started or has no completed matches: MVP is To Be Announced
      const record = {
        id: `local-w${weekNum}`,
        category_key: categoryKey,
        week_number: weekNum,
        week_title: `Matchweek ${weekNum}`,
        week_ending_date: cutoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        cutoff_datetime: cutoff.toISOString(),
        is_finalized: false,
        is_started: false,
        status: 'upcoming',
        player: null,
        stats: null,
        rationale: `Matchweek ${weekNum} fixtures have not yet started. The Weekly MVP will be announced on Saturday at 8:00 PM once matches are underway.`,
      };
      history.push(record);
      return;
    }

    const g = winner.goals;
    const a = winner.assists;
    const cs = winner.cleanSheets;
    const pts = winner.points;
    const pName = winner.player.displayName;
    const tName = winner.player.teamName;

    const parts = [];
    if (g > 0) parts.push(`${g} goal${g > 1 ? 's' : ''}`);
    if (a > 0) parts.push(`${a} assist${a > 1 ? 's' : ''}`);
    if (cs > 0) parts.push(`${cs} clean sheet${cs > 1 ? 's' : ''}`);

    let rationale = '';
    if (parts.length > 0) {
      const joined = parts.length <= 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
      rationale = `Standout performance delivering ${joined} (${pts} pts) to lead ${tName} in Matchweek ${weekNum}.`;
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
      is_started: true,
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
  });

  if (!nextUpdateCutoff) {
    const daysToSat = (6 - now.getDay() + 7) % 7;
    nextUpdateCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (daysToSat || 7), 20, 0, 0);
  }

  const nextStr = `Saturday at 8:00 PM (${nextUpdateCutoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})`;
  const currentMVP =
    latestFinalized ||
    history.find((h) => h.player) ||
    history[0] ||
    null;

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

  const player = activeRecord.player;
  const hasPlayer = Boolean(player && (player.name || player.displayName || player.id));
  const stats = activeRecord.stats || {};
  const isFinalized = Boolean(activeRecord.is_finalized);
  const rawFirst = hasPlayer ? (player.first_name || player.firstName || '').trim() : '';
  const rawUser = hasPlayer ? (player.username || '').trim() : '';
  const firstName = rawFirst && rawFirst.toLowerCase() !== 'unrecorded' ? rawFirst : '';
  // Rule: stats should show first name when available if not show username
  const displayName = hasPlayer ? (firstName || rawUser || player.name || 'Official MVP') : 'To Be Announced';

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
              background: !hasPlayer
                ? 'rgba(255, 149, 0, 0.15)'
                : isFinalized
                ? '#FF9500'
                : 'rgba(255, 149, 0, 0.2)',
              color: !hasPlayer ? '#FF9F0A' : isFinalized ? '#000000' : '#FF9F0A',
              border: !hasPlayer ? '1px solid rgba(255, 149, 0, 0.35)' : 'none',
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
            <span>{!hasPlayer ? '⏳' : isFinalized ? '🏆' : '⚡'}</span>
            <span>
              {!hasPlayer
                ? 'TO BE ANNOUNCED'
                : isFinalized
                ? 'OFFICIAL WEEKLY MVP'
                : 'PROVISIONAL MVP (IN PROGRESS)'}
            </span>
          </span>

          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary, #8E8E93)' }}>
            {activeRecord.week_title || `Matchweek ${activeRecord.week_number}`}
            {activeRecord.week_ending_date &&
              ` · ${isFinalized ? 'Ended' : 'Cutoff'} Sat, ${activeRecord.week_ending_date} 8:00 PM`}
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
            const hasP = Boolean(h.player && (h.player.name || h.player.displayName || h.player.id));
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
                {hasP ? (
                  h.is_finalized ? (
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>✓</span>
                  ) : (
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>⚡</span>
                  )
                ) : (
                  <span style={{ fontSize: '9.5px', opacity: 0.75, letterSpacing: '0.04em' }}>TBA</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* MVP Content Area */}
      {!hasPlayer ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '20px',
            padding: '4px 0',
          }}
        >
          {/* Left: TBA Announcement Identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 320px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.2) 0%, rgba(217, 119, 0, 0.08) 100%)',
                border: '1px dashed rgba(255, 149, 0, 0.45)',
                color: '#FF9500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              ⏳
            </div>

            <div>
              <div
                style={{
                  fontSize: '11.5px',
                  fontWeight: 800,
                  color: '#FF9500',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: '2px',
                }}
              >
                {activeRecord.week_title || `Matchweek ${activeRecord.week_number}`} · UPCOMING MVP
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
                To Be Announced
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary, #8E8E93)' }}>
                Fixtures have not yet started · Evaluated after match kickoff
              </div>
            </div>
          </div>

          {/* Right: Schedule & Rules Badges */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div
              style={{
                background: '#1C1C1E',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '10px 14px',
                textAlign: 'center',
                minWidth: '100px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#FF9500' }}>
                Sat 8:00 PM
              </div>
              <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
                Award Window
              </div>
            </div>

            <div
              style={{
                background: '#1C1C1E',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '10px 14px',
                textAlign: 'center',
                minWidth: '100px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#30D158' }}>
                Pending Kickoff
              </div>
              <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
                Match Status
              </div>
            </div>

            <div
              style={{
                background: 'rgba(255, 149, 0, 0.08)',
                border: '1px solid rgba(255, 149, 0, 0.3)',
                borderRadius: '10px',
                padding: '10px 14px',
                textAlign: 'center',
                minWidth: '110px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#FF9F0A' }}>
                Top Performer
              </div>
              <div style={{ fontSize: '10px', color: '#FF9500', fontWeight: 800, textTransform: 'uppercase', marginTop: '2px' }}>
                MVP Formula
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* MVP Player Hero Section */
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
      )}

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

function LeaderboardModal({ title, list, countKey, onClose }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return list || [];
    return (list || []).filter((p) => {
      const name = (p.displayName || p.name || '').toLowerCase();
      const user = (p.username || '').toLowerCase();
      const team = (p.teamName || '').toLowerCase();
      return name.includes(q) || user.includes(q) || team.includes(q);
    });
  }, [list, search]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#161618',
          border: '1px solid rgba(255, 149, 0, 0.35)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#121212',
          }}
        >
          <div>
            <h3 className="scoreboard" style={{ margin: 0, fontSize: '20px', color: '#FF9500', letterSpacing: '0.04em' }}>
              {title.toUpperCase()}
            </h3>
            <span style={{ fontSize: '12px', color: '#8E8E93' }}>
              Complete Leaderboard Ranking · {list?.length || 0} Registered Entries
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8E8E93',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: '#141416' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by player name, username, or club…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', fontSize: '13px', padding: '9px 12px' }}
            autoFocus
          />
        </div>

        {/* List Table */}
        <div style={{ overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map((p, i) => {
            const rawFirst = (p.firstName || p.first_name || '').trim();
            const rawUser = (p.username || '').trim();
            const firstName = (rawFirst && rawFirst.toLowerCase() !== 'unrecorded') ? rawFirst : '';
            const displayName = p.displayName || firstName || rawUser || p.name || p.id;
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

            return (
              <div
                key={p.id || i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: rank === 1 ? 'rgba(255, 149, 0, 0.14)' : '#1C1C1E',
                  border: rank <= 3 ? '1px solid rgba(255, 149, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '13.5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: medal ? '16px' : '12px',
                      color: medal ? '#FF9500' : '#8E8E93',
                      width: '24px',
                      textAlign: 'center',
                      fontWeight: 800,
                    }}
                  >
                    {medal || rank}
                  </span>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: p.teamColor || '#FF9500',
                      display: 'inline-block',
                    }}
                  />
                  <div>
                    <span style={{ fontWeight: 700, color: '#fff' }}>{displayName}</span>
                    {rawUser && <span style={{ fontSize: '12px', color: '#8E8E93', marginLeft: '6px' }}>@{rawUser}</span>}
                  </div>
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
                  {p.jerseyNumber && (
                    <span style={{ fontSize: '11px', color: '#8E8E93' }}>#{p.jerseyNumber}</span>
                  )}
                  <span style={{ fontSize: '12px', color: '#8E8E93' }}>({p.teamName})</span>
                </div>
                <div
                  className="scoreboard"
                  style={{ fontSize: '22px', color: '#FF9500', fontWeight: 800, minWidth: '40px', textAlign: 'right' }}
                >
                  {p[countKey]}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#8E8E93', fontSize: '13px' }}>
              No matching players found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeaderboardCard({ title, list = [], countKey }) {
  const [showModal, setShowModal] = useState(false);
  const previewLimit = 6;
  const previewList = (list || []).slice(0, previewLimit);
  const totalCount = (list || []).length;

  return (
    <>
      <div
        style={{
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '14px',
          padding: '16px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div
              className="scoreboard"
              style={{
                color: '#FF9500',
                fontSize: '18px',
                letterSpacing: '0.05em',
              }}
            >
              {title.toUpperCase()}
            </div>
            {totalCount > 0 && (
              <span style={{ fontSize: '11px', color: '#8E8E93' }}>
                {totalCount} total
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {previewList.map((p, i) => {
              const rawFirst = (p.firstName || p.first_name || '').trim();
              const rawUser = (p.username || '').trim();
              const firstName = (rawFirst && rawFirst.toLowerCase() !== 'unrecorded') ? rawFirst : '';
              const displayName = p.displayName || firstName || rawUser || p.name || p.id;
              const tooltip = p.fullName && p.fullName !== displayName ? `${p.fullName} (@${rawUser || p.username || ''})` : displayName;

              return (
                <div
                  key={p.id || i}
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

        {totalCount > 0 && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              marginTop: '12px',
              background: 'rgba(255, 149, 0, 0.08)',
              border: '1px solid rgba(255, 149, 0, 0.25)',
              color: '#FF9500',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'background 0.2s',
            }}
          >
            <span>View More ({totalCount})</span>
            <span>➔</span>
          </button>
        )}
      </div>

      {showModal && (
        <LeaderboardModal
          title={title}
          list={list}
          countKey={countKey}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function PlayerBanDetailModal({ ban, onClose, isCmsMode, onLiftBan }) {
  if (!ban) return null;
  const isPeriod = ban.ban_type === 'period';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#161618',
          border: '1px solid rgba(255, 69, 58, 0.4)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '540px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#121212',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '22px' }}>⛔</span>
            <div>
              <h3 className="scoreboard" style={{ margin: 0, fontSize: '18px', color: '#FF453A' }}>
                DISCIPLINARY BAN DETAILS
              </h3>
              <span style={{ fontSize: '11px', color: '#8E8E93' }}>Official Club Sanction Record</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8E8E93',
              fontSize: '22px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Player Info Card */}
          <div
            style={{
              background: '#121212',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                {ban.player?.displayName || ban.player?.name}
              </div>
              <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '2px' }}>
                {ban.player?.position || 'Player'}
                {ban.player?.jersey_number ? ` · Jersey #${ban.player.jersey_number}` : ''}
                {ban.player?.username ? ` · @${ban.player.username}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: ban.team?.color || '#FF9500',
                }}
              />
              <span style={{ fontWeight: 700, fontSize: '13px', color: ban.team?.color || '#FF9500' }}>
                {ban.team?.name}
              </span>
            </div>
          </div>

          {/* Sanction Duration Banner */}
          <div
            style={{
              background: 'rgba(255, 69, 58, 0.12)',
              border: '1px solid rgba(255, 69, 58, 0.3)',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#FF453A', fontWeight: 800 }}>
                SANCTION DURATION
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                {ban.duration_label || (isPeriod ? ban.period_description : `${ban.games_banned} Matches`)}
              </div>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '999px',
                background: ban.is_active ? 'rgba(255, 69, 58, 0.25)' : 'rgba(48, 209, 88, 0.2)',
                color: ban.is_active ? '#FF453A' : '#30D158',
                border: `1px solid ${ban.is_active ? '#FF453A' : '#30D158'}`,
              }}
            >
              {ban.is_active ? '🔴 Active Suspension' : '✓ Ban Lifted / Served'}
            </span>
          </div>

          {/* Reason */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#8E8E93', textTransform: 'uppercase', marginBottom: '6px' }}>
              📜 Rule Infringement / Reason for Ban:
            </div>
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '13.5px',
                color: '#E5E5EA',
                lineHeight: '1.5',
              }}
            >
              {ban.reason || 'Infringement of official Titans club disciplinary and sportsmanship regulations.'}
            </div>
          </div>

          {/* Expected Return Date / Fixture */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div style={{ background: '#121212', borderRadius: '8px', padding: '10px 14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '11px', color: '#8E8E93', textTransform: 'uppercase', fontWeight: 700 }}>
                ⚽ Expected Return Fixture:
              </div>
              <div style={{ fontSize: '13.5px', color: '#FF9500', fontWeight: 700, marginTop: '3px' }}>
                {ban.expected_fixture_return || 'To Be Announced'}
              </div>
            </div>

            <div style={{ background: '#121212', borderRadius: '8px', padding: '10px 14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '11px', color: '#8E8E93', textTransform: 'uppercase', fontWeight: 700 }}>
                📅 Projected Return Date:
              </div>
              <div style={{ fontSize: '13.5px', color: '#fff', fontWeight: 600, marginTop: '3px' }}>
                {ban.return_date ? new Date(ban.return_date).toLocaleDateString() : 'Upon suspension completion'}
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#636366', paddingTop: '4px' }}>
            <span>Imposed: {ban.start_date || 'Current Season'}</span>
            <span>Sanctioned by: {ban.imposed_by || 'Club Disciplinary Committee'}</span>
          </div>

          {/* Admin Controls */}
          {isCmsMode && ban.is_active && (
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => onLiftBan(ban.id)}
                style={{
                  background: 'rgba(48, 209, 88, 0.15)',
                  border: '1px solid #30D158',
                  color: '#30D158',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ✓ Lift Suspension Early
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateBanModal({ categoryKey, categoryObj, onClose, onCreated }) {
  const [playerId, setPlayerId] = useState('');
  const [banType, setBanType] = useState('games');
  const [gamesBanned, setGamesBanned] = useState(1);
  const [periodDesc, setPeriodDesc] = useState('');
  const [reason, setReason] = useState('');
  const [expectedFixture, setExpectedFixture] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Collect all players from teams in this category
  const players = useMemo(() => {
    const list = [];
    (categoryObj?.teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        if (!p.unknown) {
          list.push({
            id: p.id,
            name: p.name,
            displayName: p.displayName || p.name,
            teamName: t.name,
          });
        }
      });
    });
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [categoryObj]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!playerId) {
      setErrorMsg('Please select a player to issue a ban.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await api.createBan(categoryKey, {
        player_id: playerId,
        ban_type: banType,
        games_banned: parseInt(gamesBanned, 10) || 1,
        period_description: periodDesc,
        reason,
        expected_fixture_return: expectedFixture,
        return_date: returnDate || null,
      });
      onCreated();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to issue ban.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#161618',
          border: '1px solid rgba(255, 69, 58, 0.4)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#121212',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>⚖️</span>
            <h3 className="scoreboard" style={{ margin: 0, fontSize: '18px', color: '#FF453A' }}>
              ISSUE PLAYER DISCIPLINARY SANCTION
            </h3>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8E8E93', fontSize: '22px', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {errorMsg && (
            <div style={{ background: 'rgba(255, 69, 58, 0.15)', border: '1px solid #FF453A', color: '#FF6961', padding: '10px', borderRadius: '8px', fontSize: '13px' }}>
              {errorMsg}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#C7C7CC', marginBottom: '6px' }}>
              Player Infringing Rules *
            </label>
            <select
              className="form-input"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              required
              style={{ width: '100%', fontSize: '13px' }}
            >
              <option value="">Select Player…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.displayName} ({p.teamName})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#C7C7CC', marginBottom: '6px' }}>
                Sanction Type *
              </label>
              <select
                className="form-input"
                value={banType}
                onChange={(e) => setBanType(e.target.value)}
                style={{ width: '100%', fontSize: '13px' }}
              >
                <option value="games">Number of Games / Matches</option>
                <option value="period">Time Period / Weeks / Months</option>
              </select>
            </div>

            {banType === 'games' ? (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#C7C7CC', marginBottom: '6px' }}>
                  Games Banned
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  className="form-input"
                  value={gamesBanned}
                  onChange={(e) => setGamesBanned(e.target.value)}
                  style={{ width: '100%', fontSize: '13px' }}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#C7C7CC', marginBottom: '6px' }}>
                  Period Description (e.g. 2 Weeks, 1 Month)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 3 Weeks"
                  className="form-input"
                  value={periodDesc}
                  onChange={(e) => setPeriodDesc(e.target.value)}
                  style={{ width: '100%', fontSize: '13px' }}
                />
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#C7C7CC', marginBottom: '6px' }}>
              Infringement / Reason for Ban *
            </label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Detail the club rule, code of conduct infringement, or incident…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              style={{ width: '100%', resize: 'vertical', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#C7C7CC', marginBottom: '6px' }}>
                Expected Fixture Return (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Matchweek 4 vs Tigers"
                className="form-input"
                value={expectedFixture}
                onChange={(e) => setExpectedFixture(e.target.value)}
                style={{ width: '100%', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#C7C7CC', marginBottom: '6px' }}>
                Projected Return Date (optional)
              </label>
              <input
                type="date"
                className="form-input"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                style={{ width: '100%', fontSize: '13px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#8E8E93',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: '#FF453A',
                border: 'none',
                color: '#fff',
                padding: '8px 20px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {submitting ? 'Imposing Sanction…' : 'Impose Sanction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BannedPlayersSection({ categoryKey, categoryObj, isCmsMode }) {
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBan, setSelectedBan] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchBans = async () => {
    if (!categoryKey) return;
    setLoading(true);
    try {
      const data = await api.getBans(categoryKey);
      setBans(data.active_bans || []);
    } catch (err) {
      console.error('Failed to load bans:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBans();
  }, [categoryKey]);

  const handleLiftBan = async (banId) => {
    try {
      await api.liftBan(categoryKey, banId);
      setSelectedBan(null);
      fetchBans();
    } catch (err) {
      alert(err.message || 'Failed to lift ban');
    }
  };

  return (
    <div
      style={{
        background: '#121212',
        border: '1px solid rgba(255, 69, 58, 0.3)',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>⛔</span>
          <div>
            <h4 className="scoreboard" style={{ margin: 0, fontSize: '18px', color: '#FF453A', letterSpacing: '0.04em' }}>
              OFFICIAL DISCIPLINARY &amp; SUSPENSIONS BOARD
            </h4>
            <span style={{ fontSize: '12px', color: '#8E8E93' }}>
              Players serving disciplinary bans for club rule infringements ({bans.length} active)
            </span>
          </div>
        </div>

        {isCmsMode && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{
              background: 'rgba(255, 69, 58, 0.15)',
              border: '1px solid #FF453A',
              color: '#FF453A',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>+ Issue Disciplinary Ban</span>
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: '12px', color: '#8E8E93', textAlign: 'center', padding: '16px 0' }}>
          Checking disciplinary records…
        </div>
      ) : bans.length === 0 ? (
        <div
          style={{
            background: 'rgba(48, 209, 88, 0.08)',
            border: '1px solid rgba(48, 209, 88, 0.2)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '18px' }}>✅</span>
          <span style={{ fontSize: '13px', color: '#E5E5EA' }}>
            <strong>Clean Disciplinary Record:</strong> All registered players in this competition are eligible to compete. No active suspensions or club rule bans are currently in effect.
          </span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
          {bans.map((ban) => (
            <div
              key={ban.id}
              onClick={() => setSelectedBan(ban)}
              style={{
                background: '#1C1C1E',
                border: '1px solid rgba(255, 69, 58, 0.25)',
                borderRadius: '10px',
                padding: '12px 14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
              title="Click for full ban details, reason, and return date"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: ban.team?.color || '#FF9500',
                    }}
                  />
                  <span style={{ fontWeight: 800, fontSize: '14px', color: '#fff' }}>
                    {ban.player?.displayName || ban.player?.name}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#8E8E93' }}>
                  Club: <strong style={{ color: '#E5E5EA' }}>{ban.team?.name}</strong>
                </div>
                <div style={{ fontSize: '11px', color: '#FF453A', fontWeight: 700 }}>
                  Sanction: {ban.duration_label || (ban.ban_type === 'games' ? `${ban.games_banned} matches` : ban.period_description)}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(255, 69, 58, 0.2)',
                    color: '#FF6961',
                    border: '1px solid rgba(255, 69, 58, 0.35)',
                    textTransform: 'uppercase',
                  }}
                >
                  Suspended
                </span>
                <span style={{ fontSize: '11px', color: '#8E8E93' }}>View Details ➔</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedBan && (
        <PlayerBanDetailModal
          ban={selectedBan}
          onClose={() => setSelectedBan(null)}
          isCmsMode={isCmsMode}
          onLiftBan={handleLiftBan}
        />
      )}

      {showCreateModal && (
        <CreateBanModal
          categoryKey={categoryKey}
          categoryObj={categoryObj}
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchBans}
        />
      )}
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
        <div style={{ marginTop: '16px' }}>
          <BannedPlayersSection categoryKey={activeCategoryKey} categoryObj={categories?.[activeCategoryKey]} isCmsMode={isCmsMode} />
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

            {/* Official Disciplinary Bans & Suspensions Board */}
            <div style={{ marginTop: '16px' }}>
              <BannedPlayersSection
                categoryKey={catKey}
                categoryObj={catObj}
                isCmsMode={isCmsMode}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
