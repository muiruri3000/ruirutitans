import React, { useState, useMemo } from 'react';
import TableView from './TableView';
import CupProgressionView from './CupProgressionView';
import { api } from '../api/client';
import { OPEN_2026_ARCHIVED_SEASON } from '../data/defaultState';

function computeFixtureScore(f) {
  let hs = 0;
  let as = 0;
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
  return { hs, as };
}

function calculateCategoryStandings(catObj) {
  if (!catObj || !catObj.teams) return [];
  const teams = catObj.teams || [];
  const fixtures = catObj.fixtures || [];

  const map = {};
  teams.forEach((t) => {
    map[t.id] = {
      team: t.id,
      name: t.name,
      color: t.color,
      P: 0,
      W: 0,
      D: 0,
      L: 0,
      GF: 0,
      GA: 0,
      GD: 0,
      Pts: 0,
      form: [],
    };
  });

  const playedFixtures = fixtures.filter((f) => f.played || f.walkover);
  playedFixtures.forEach((f) => {
    const h = map[f.home];
    const a = map[f.away];
    if (!h || !a) return;

    h.P++;
    a.P++;
    const { hs, as } = computeFixtureScore(f);
    h.GF += hs;
    h.GA += as;
    a.GF += as;
    a.GA += hs;

    if (hs > as) {
      h.W++;
      h.Pts += 3;
      a.L++;
      h.form.push('W');
      a.form.push('L');
    } else if (as > hs) {
      a.W++;
      a.Pts += 3;
      h.L++;
      a.form.push('W');
      h.form.push('L');
    } else {
      h.D++;
      a.D++;
      h.Pts += 1;
      a.Pts += 1;
      h.form.push('D');
      a.form.push('D');
    }
  });

  const rows = Object.values(map);
  rows.forEach((r) => {
    r.GD = r.GF - r.GA;
    r.form = r.form.slice(-5);
  });

  return rows.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF);
}

function extractPlayerStats(catObj) {
  if (!catObj || !catObj.teams) {
    return { scorers: [], assists: [], cards: [], totalGoals: 0 };
  }
  const meta = {};
  (catObj.teams || []).forEach((t) => {
    (t.players || []).forEach((p) => {
      if (!p.unknown) {
        const rawFirst = (p.firstName || p.first_name || '').trim();
        const rawUser = (p.username || '').trim();
        const rawName = (p.name || '').trim();
        const firstName = (rawFirst && rawFirst.toLowerCase() !== 'unrecorded') ? rawFirst : '';
        // Stats should show first name when available; if not, show username
        const displayName = firstName || rawUser || rawName || p.id;

        meta[p.id] = {
          id: p.id,
          name: displayName,
          displayName,
          fullName: rawName,
          firstName,
          username: rawUser,
          teamName: t.name,
          teamColor: t.color,
          goals: 0,
          assists: 0,
          yellows: 0,
          reds: 0,
        };
      }
    });
  });

  let totalGoals = 0;
  const fixtures = catObj.fixtures || [];
  fixtures.forEach((f) => {
    (f.events || []).forEach((e) => {
      if (e.type === 'goal') {
        totalGoals++;
        if (meta[e.playerId]) meta[e.playerId].goals++;
        if (e.assistPlayerId && meta[e.assistPlayerId]) meta[e.assistPlayerId].assists++;
      } else if (e.type === 'assist') {
        if (meta[e.playerId]) meta[e.playerId].assists++;
      } else if (e.type === 'owngoal') {
        totalGoals++;
      } else if (e.type === 'yellow') {
        if (meta[e.playerId]) meta[e.playerId].yellows++;
      } else if (e.type === 'red') {
        if (meta[e.playerId]) meta[e.playerId].reds++;
      }
    });
  });

  const allPlayers = Object.values(meta);
  const scorers = allPlayers.filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals);
  const assists = allPlayers.filter((p) => p.assists > 0).sort((a, b) => b.assists - a.assists);
  const cards = allPlayers
    .filter((p) => p.yellows > 0 || p.reds > 0)
    .sort((a, b) => b.reds * 2 + b.yellows - (a.reds * 2 + a.yellows));

  return { scorers, assists, cards, totalGoals };
}

export default function ArchivesView({
  categories = {},
  isCmsMode = false,
  cmsUser = null,
  onUpdateCategory,
  onSelectTeam,
}) {
  const [selectedArchiveKey, setSelectedArchiveKey] = useState(null);
  const [activeTab, setActiveTab] = useState('table'); // 'table' | 'results' | 'stats' | 'bracket'

  // Identify all ended tournaments
  const endedTournaments = useMemo(() => {
    const list = [];
    const sourceCats = { ...(categories || {}) };
    if (!sourceCats.open_2026 && OPEN_2026_ARCHIVED_SEASON) {
      sourceCats.open_2026 = OPEN_2026_ARCHIVED_SEASON;
    }
    Object.entries(sourceCats).forEach(([key, cat]) => {
      if (!cat || cat.isDeleted) return;
      const allFixtures = cat.fixtures || [];
      const isExplicitEnded = Boolean(cat.isEnded);
      const isAllFixturesPlayed =
        allFixtures.length > 0 && allFixtures.every((f) => f.played || f.walkover);

      if (isExplicitEnded || isAllFixturesPlayed) {
        const standings = calculateCategoryStandings(cat);
        const stats = extractPlayerStats(cat);
        const champion = cat.championTeam || standings[0]?.name || 'TBD';
        const runnerUp = cat.runnerUpTeam || standings[1]?.name || 'TBD';

        list.push({
          key,
          label: cat.label || key,
          mode: cat.mode || 'league',
          format: cat.format || 'double',
          note: cat.note || '',
          teamsCount: cat.teams?.length || 0,
          fixturesCount: allFixtures.length,
          totalGoals: stats.totalGoals,
          champion,
          runnerUp,
          topScorer: stats.scorers[0] || null,
          isExplicitEnded,
          endedAt: cat.endedAt,
          catObj: cat,
        });
      }
    });
    return list;
  }, [categories]);

  // Active dossier category object
  const activeArchive = useMemo(() => {
    if (!selectedArchiveKey) return null;
    const item = endedTournaments.find((t) => t.key === selectedArchiveKey);
    if (item && item.fixturesCount > 0) return item;
    const sourceCats = { ...(categories || {}) };
    if (!sourceCats.open_2026 && OPEN_2026_ARCHIVED_SEASON) {
      sourceCats.open_2026 = OPEN_2026_ARCHIVED_SEASON;
    }
    let cat = sourceCats[selectedArchiveKey];
    if (selectedArchiveKey === 'open' && (!cat || !cat.fixtures || cat.fixtures.length === 0)) {
      cat = sourceCats.open_2026;
    }
    if (cat) {
      const standings = calculateCategoryStandings(cat);
      const stats = extractPlayerStats(cat);
      return {
        key: selectedArchiveKey,
        label: cat.label || selectedArchiveKey,
        mode: cat.mode || 'league',
        format: cat.format || 'double',
        note: cat.note || '',
        teamsCount: cat.teams?.length || 0,
        fixturesCount: (cat.fixtures || []).length,
        totalGoals: stats.totalGoals,
        champion: cat.championTeam || standings[0]?.name || 'TBD',
        runnerUp: cat.runnerUpTeam || standings[1]?.name || 'TBD',
        topScorer: stats.scorers[0] || null,
        isExplicitEnded: Boolean(cat.isEnded),
        endedAt: cat.endedAt,
        catObj: cat,
      };
    }
    return null;
  }, [selectedArchiveKey, endedTournaments, categories]);

  const activeStandings = useMemo(() => {
    if (!activeArchive?.catObj) return [];
    return calculateCategoryStandings(activeArchive.catObj);
  }, [activeArchive]);

  const activeStats = useMemo(() => {
    if (!activeArchive?.catObj) return { scorers: [], assists: [], cards: [], totalGoals: 0 };
    return extractPlayerStats(activeArchive.catObj);
  }, [activeArchive]);

  const handleToggleArchive = async (catKey, currentEndedStatus) => {
    const nextEnded = !currentEndedStatus;
    const targetCat = categories[catKey];
    let champ = targetCat?.championTeam || '';
    if (nextEnded && !champ) {
      const std = calculateCategoryStandings(targetCat);
      champ = std[0]?.name || '';
    }

    try {
      await api.toggleCategoryArchive(catKey, {
        isEnded: nextEnded,
        championTeam: champ,
      });
      if (onUpdateCategory) {
        onUpdateCategory(catKey, (c) => ({
          ...c,
          isEnded: nextEnded,
          championTeam: champ,
          endedAt: nextEnded ? new Date().toISOString() : null,
        }));
      }
    } catch (err) {
      alert('Failed to update tournament archive status: ' + err.message);
    }
  };

  const teamsById = useMemo(() => {
    if (!activeArchive?.catObj) return {};
    const map = {};
    (activeArchive.catObj.teams || []).forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [activeArchive]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #000000 0%, #121212 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span
              style={{
                background: 'rgba(255, 149, 0, 0.2)',
                border: '1px solid #FF9500',
                color: '#FF9500',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.06em',
              }}
            >
              🏛️ HISTORICAL TOURNAMENT ARCHIVES
            </span>
            <span style={{ fontSize: '11px', color: '#8E8E93' }}>Ruiru Titans FC Hall of Fame</span>
          </div>
          <h1
            className="scoreboard"
            style={{
              margin: '0 0 6px',
              fontSize: '28px',
              color: '#FFFFFF',
              letterSpacing: '0.04em',
            }}
          >
            CONCLUDED COMPETITIONS &amp; TOURNAMENT ARCHIVES
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#8E8E93', maxWidth: '680px' }}>
            Explore full historical records of past Ruiru Titans leagues and tournaments. Click any competition
            to inspect its final table, full results, player goals, assists, discipline, and honoured champions.
          </p>
        </div>

        {/* Total Concluded Count Badge */}
        <div
          style={{
            background: '#071A14',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '12px 20px',
            textAlign: 'center',
          }}
        >
          <div className="scoreboard" style={{ fontSize: '26px', color: '#FF9500', margin: 0 }}>
            {endedTournaments.length}
          </div>
          <div style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>
            Archived Editions
          </div>
        </div>
      </div>

      {/* VIEW A: CONCLUDED COMPETITIONS LIST */}
      {!selectedArchiveKey && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {endedTournaments.length === 0 ? (
            <div
              style={{
                background: '#121212',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                padding: '48px 20px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🏛️</div>
              <h3 style={{ margin: '0 0 6px', color: '#FFFFFF', fontSize: '18px' }}>
                No Concluded Tournaments in Archive
              </h3>
              <p style={{ margin: '0 auto 16px', color: '#8E8E93', fontSize: '13px', maxWidth: '480px' }}>
                Competitions appear here automatically when marked ended by management or when all fixtures in the season are completed.
              </p>

              {isCmsMode && cmsUser && Object.keys(categories).length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <span style={{ fontSize: '12px', color: '#FF9500', display: 'block', marginBottom: '8px', fontWeight: 700 }}>
                    Manager Shortcut: Mark Active Tournament as Ended
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {Object.entries(categories).map(([k, c]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => handleToggleArchive(k, false)}
                        style={{
                          background: '#FF9500',
                          color: '#16201B',
                          border: 'none',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Conclude "{c.label || k}"
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '20px',
              }}
            >
              {endedTournaments.map((tourn) => (
                <div
                  key={tourn.key}
                  style={{
                    background: '#0B261D',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  {/* Card Header with Champion Banner */}
                  <div
                    style={{
                      background: 'radial-gradient(circle at 80% 20%, rgba(255, 149, 0, 0.25) 0%, #0F382B 100%)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      padding: '16px 18px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span
                        style={{
                          background: '#121212',
                          color: '#8E8E93',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {tourn.mode === 'cup' ? '🏆 Cup Tournament' : '📊 Round-Robin League'}
                      </span>
                      <span
                        style={{
                          background: 'rgba(74, 222, 128, 0.15)',
                          color: '#4ADE80',
                          border: '1px solid #2F7D5C',
                          borderRadius: '999px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '2px 8px',
                        }}
                      >
                        ✅ CONCLUDED
                      </span>
                    </div>

                    <h2
                      style={{
                        margin: '0 0 6px',
                        fontSize: '18px',
                        color: '#FFFFFF',
                        fontWeight: 800,
                      }}
                    >
                      {tourn.label}
                    </h2>

                    {/* Official Champion Highlight */}
                    <div
                      style={{
                        background: 'rgba(255, 149, 0, 0.15)',
                        border: '1px solid #FF9500',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>🏆</span>
                        <div>
                          <div style={{ fontSize: '10px', color: '#FF9500', fontWeight: 800, textTransform: 'uppercase' }}>
                            Official Champion
                          </div>
                          <div style={{ fontSize: '14px', color: '#FFFFFF', fontWeight: 800 }}>
                            {tourn.champion}
                          </div>
                        </div>
                      </div>
                      {tourn.runnerUp && tourn.runnerUp !== 'TBD' && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '9.5px', color: '#8E8E93', fontWeight: 700 }}>Runner-Up</div>
                          <div style={{ fontSize: '12px', color: '#EBEBF5', fontWeight: 700 }}>🥈 {tourn.runnerUp}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Summary Metrics */}
                  <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                      <div style={{ background: '#121212', borderRadius: '8px', padding: '8px 4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <div style={{ fontSize: '15px', color: '#FFFFFF', fontWeight: 800 }}>{tourn.teamsCount}</div>
                        <div style={{ fontSize: '10px', color: '#8E8E93', fontWeight: 600 }}>Teams</div>
                      </div>
                      <div style={{ background: '#121212', borderRadius: '8px', padding: '8px 4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <div style={{ fontSize: '15px', color: '#FFFFFF', fontWeight: 800 }}>{tourn.fixturesCount}</div>
                        <div style={{ fontSize: '10px', color: '#8E8E93', fontWeight: 600 }}>Matches</div>
                      </div>
                      <div style={{ background: '#121212', borderRadius: '8px', padding: '8px 4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <div style={{ fontSize: '15px', color: '#4ADE80', fontWeight: 800 }}>{tourn.totalGoals}</div>
                        <div style={{ fontSize: '10px', color: '#8E8E93', fontWeight: 600 }}>Goals</div>
                      </div>
                    </div>

                    {tourn.topScorer && (
                      <div
                        style={{
                          background: '#121212',
                          border: '1px dashed rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '12px',
                        }}
                      >
                        <span style={{ color: '#FF9500', fontWeight: 700 }}>
                          ⚽ Golden Boot: <strong>{tourn.topScorer.name}</strong> ({tourn.topScorer.teamName})
                        </span>
                        <span style={{ color: '#FFFFFF', fontWeight: 800 }}>
                          {tourn.topScorer.goals} {tourn.topScorer.goals === 1 ? 'goal' : 'goals'}
                        </span>
                      </div>
                    )}

                    {tourn.note && (
                      <p style={{ margin: 0, fontSize: '12px', color: '#8E8E93', lineHeight: 1.4 }}>
                        {tourn.note}
                      </p>
                    )}

                    {/* Actions */}
                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedArchiveKey(tourn.key);
                          setActiveTab('table');
                        }}
                        style={{
                          background: '#FF9500',
                          color: '#16201B',
                          border: 'none',
                          padding: '9px 16px',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '12.5px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        Explore Full Dossier →
                      </button>

                      {isCmsMode && cmsUser && (
                        <button
                          type="button"
                          onClick={() => handleToggleArchive(tourn.key, true)}
                          style={{
                            background: 'none',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#8E8E93',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                          title="Reopen competition and remove from archives"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW B: CONCLUDED TOURNAMENT DOSSIER (DETAILED VIEW) */}
      {selectedArchiveKey && activeArchive && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Back Button and Dossier Top Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedArchiveKey(null)}
              style={{
                background: '#121212',
                color: '#FF9500',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              ← Back to All Concluded Tournaments
            </button>

            <div style={{ display: 'inline-flex', gap: '8px' }}>
              <a
                href={`/api/categories/${activeArchive.key}/export/standings-csv/`}
                download
                className="btn-pill-action"
                style={{ textDecoration: 'none' }}
              >
                📥 Export Table CSV
              </a>
              <a
                href={`/api/categories/${activeArchive.key}/export/fixtures-csv/`}
                download
                className="btn-pill-action"
                style={{ textDecoration: 'none' }}
              >
                📥 Export Results CSV
              </a>
            </div>
          </div>

          {/* Dossier Champion Hero Card */}
          <div
            style={{
              background: 'radial-gradient(circle at 90% 10%, rgba(255, 149, 0, 0.28) 0%, #0F382B 60%, #000000 100%)',
              border: '1px solid #FF9500',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '20px',
            }}
          >
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span
                  style={{
                    background: '#FF9500',
                    color: '#16201B',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 900,
                    letterSpacing: '0.04em',
                  }}
                >
                  🏆 CONCLUDED EDITION
                </span>
                <span style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 700 }}>
                  {activeArchive.format === 'single' ? 'Single Round-Robin' : 'Double Round-Robin'}
                </span>
              </div>

              <h1 className="scoreboard" style={{ margin: '0 0 6px', fontSize: '32px', color: '#FFFFFF' }}>
                {activeArchive.label}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '18px' }}>🥇</span>
                  <span style={{ fontSize: '13px', color: '#8E8E93' }}>Champion:</span>
                  <span style={{ fontSize: '15px', color: '#FF9500', fontWeight: 900 }}>
                    {activeArchive.champion}
                  </span>
                </div>
                {activeArchive.runnerUp && activeArchive.runnerUp !== 'TBD' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '18px' }}>🥈</span>
                    <span style={{ fontSize: '13px', color: '#8E8E93' }}>Runner-Up:</span>
                    <span style={{ fontSize: '14px', color: '#FFFFFF', fontWeight: 700 }}>
                      {activeArchive.runnerUp}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Summary Pill Stats */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ background: '#0B261D', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '10px 16px', textAlign: 'center' }}>
                <div className="scoreboard" style={{ fontSize: '20px', color: '#FFFFFF', margin: 0 }}>
                  {activeArchive.teamsCount}
                </div>
                <div style={{ fontSize: '10px', color: '#8E8E93', fontWeight: 700 }}>TEAMS</div>
              </div>
              <div style={{ background: '#0B261D', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '10px 16px', textAlign: 'center' }}>
                <div className="scoreboard" style={{ fontSize: '20px', color: '#FFFFFF', margin: 0 }}>
                  {activeArchive.fixturesCount}
                </div>
                <div style={{ fontSize: '10px', color: '#8E8E93', fontWeight: 700 }}>MATCHES</div>
              </div>
              <div style={{ background: '#0B261D', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '10px 16px', textAlign: 'center' }}>
                <div className="scoreboard" style={{ fontSize: '20px', color: '#4ADE80', margin: 0 }}>
                  {activeArchive.totalGoals}
                </div>
                <div style={{ fontSize: '10px', color: '#8E8E93', fontWeight: 700 }}>GOALS</div>
              </div>
            </div>
          </div>

          {/* Dossier Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              background: '#121212',
              padding: '6px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflowX: 'auto',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('table')}
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'table' ? '#FF9500' : 'transparent',
                color: activeTab === 'table' ? '#16201B' : '#8E8E93',
                fontWeight: 800,
                fontSize: '12.5px',
                whiteSpace: 'nowrap',
              }}
            >
              📊 Final Standings Table
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('results')}
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'results' ? '#FF9500' : 'transparent',
                color: activeTab === 'results' ? '#16201B' : '#8E8E93',
                fontWeight: 800,
                fontSize: '12.5px',
                whiteSpace: 'nowrap',
              }}
            >
              ⚽ All Match Results ({activeArchive.fixturesCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'stats' ? '#FF9500' : 'transparent',
                color: activeTab === 'stats' ? '#16201B' : '#8E8E93',
                fontWeight: 800,
                fontSize: '12.5px',
                whiteSpace: 'nowrap',
              }}
            >
              📈 Player Honours &amp; Stats
            </button>
            {activeArchive.mode === 'cup' && (
              <button
                type="button"
                onClick={() => setActiveTab('bracket')}
                style={{
                  flex: 1,
                  padding: '9px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  background: activeTab === 'bracket' ? '#FF9500' : 'transparent',
                  color: activeTab === 'bracket' ? '#16201B' : '#8E8E93',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  whiteSpace: 'nowrap',
                }}
              >
                🏆 Cup Progression Bracket
              </button>
            )}
          </div>

          {/* TAB CONTENT 1: FINAL STANDINGS TABLE */}
          {activeTab === 'table' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="scoreboard" style={{ margin: 0, fontSize: '20px', color: '#FFFFFF' }}>
                  📊 OFFICIAL FINAL STANDINGS TABLE
                </h3>
                <span style={{ fontSize: '12px', color: '#FF9500', fontWeight: 700 }}>
                  🏆 Champion: {activeArchive.champion}
                </span>
              </div>

              <TableView
                table={activeStandings}
                teamCount={activeArchive.teamsCount}
                activeCategoryKey={activeArchive.key}
                onSelectTeam={onSelectTeam}
              />
            </div>
          )}

          {/* TAB CONTENT 2: ALL RESULTS & EVENTS */}
          {activeTab === 'results' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="scoreboard" style={{ margin: 0, fontSize: '20px', color: '#FFFFFF' }}>
                  ⚽ COMPLETE SEASON MATCH RESULTS &amp; EVENTS
                </h3>
                <span style={{ fontSize: '12px', color: '#8E8E93' }}>
                  {activeArchive.fixturesCount} Played Fixtures
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(activeArchive.catObj?.fixtures || []).map((f) => {
                  const home = teamsById[f.home];
                  const away = teamsById[f.away];
                  const { hs, as } = computeFixtureScore(f);
                  const isHomeWinner = hs > as;
                  const isAwayWinner = as > hs;

                  return (
                    <div
                      key={f.id}
                      style={{
                        background: '#0B261D',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        {/* Home Team */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: home?.color || '#FF9500',
                            }}
                          />
                          <button
                            type="button"
                            className="team-link-btn"
                            onClick={() => onSelectTeam && onSelectTeam(f.home, activeArchive.key)}
                            style={{
                              fontWeight: isHomeWinner ? 800 : 600,
                              fontSize: '14px',
                              color: isHomeWinner ? '#FF9500' : '#FFFFFF',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            {home?.name || f.home}
                          </button>
                        </div>

                        {/* Score Box */}
                        <div style={{ textAlign: 'center', minWidth: '90px' }}>
                          <span
                            className="scoreboard"
                            style={{
                              fontSize: '20px',
                              color: '#FFFFFF',
                              background: '#071A14',
                              padding: '4px 14px',
                              borderRadius: '8px',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              letterSpacing: '0.06em',
                            }}
                          >
                            {hs} - {as}
                          </span>
                          <div style={{ fontSize: '10px', color: '#8E8E93', marginTop: '4px' }}>
                            {f.date} {f.referee ? `· Ref: ${f.referee}` : ''}
                          </div>
                        </div>

                        {/* Away Team */}
                        <div
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '10px',
                            textAlign: 'right',
                          }}
                        >
                          <button
                            type="button"
                            className="team-link-btn"
                            onClick={() => onSelectTeam && onSelectTeam(f.away, activeArchive.key)}
                            style={{
                              fontWeight: isAwayWinner ? 800 : 600,
                              fontSize: '14px',
                              color: isAwayWinner ? '#FF9500' : '#FFFFFF',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            {away?.name || f.away}
                          </button>
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: away?.color || '#2E5A8F',
                            }}
                          />
                        </div>
                      </div>

                      {/* Match Events (Goals & Cards) */}
                      {f.events && f.events.length > 0 && (
                        <div
                          style={{
                            borderTop: '1px dashed rgba(255, 255, 255, 0.1)',
                            paddingTop: '6px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px',
                            fontSize: '11px',
                          }}
                        >
                          {f.events.map((e, idx) => {
                            const tObj = teamsById[e.teamId];
                            const pObj = tObj?.players?.find((p) => p.id === e.playerId);
                            const pName = e.name || pObj?.name || (e.unknown ? 'Unrecorded' : 'Player');
                            return (
                              <span
                                key={idx}
                                style={{
                                  background: '#121212',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  color: '#EBEBF5',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                {e.type === 'goal' && '⚽'}
                                {e.type === 'yellow' && '🟨'}
                                {e.type === 'red' && '🟥'}
                                {e.type === 'owngoal' && '💥 OG'}
                                <span>{pName}</span>
                                <span style={{ color: '#8E8E93', fontSize: '9.5px' }}>
                                  ({tObj?.name || e.teamId})
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB CONTENT 3: PLAYER HONOURS & STATS */}
          {activeTab === 'stats' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* Golden Boot Top Scorers */}
              <div
                style={{
                  background: '#0B261D',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '20px' }}>⚽</span>
                  <h3 className="scoreboard" style={{ margin: 0, fontSize: '18px', color: '#FFFFFF' }}>
                    GOLDEN BOOT (TOP SCORERS)
                  </h3>
                </div>

                {activeStats.scorers.length === 0 ? (
                  <div style={{ color: '#8E8E93', fontSize: '12px' }}>No goals recorded.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activeStats.scorers.slice(0, 10).map((p, idx) => (
                      <div
                        key={p.id}
                        style={{
                          background: idx === 0 ? 'rgba(255, 149, 0, 0.15)' : '#121212',
                          border: idx === 0 ? '1px solid #FF9500' : '1px solid #1C1C1E',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: idx === 0 ? '#FF9500' : '#121212',
                              color: idx === 0 ? '#16201B' : '#8E8E93',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 800,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: '#FFFFFF' }}>
                            {p.name}
                          </span>
                          <span style={{ fontSize: '11px', color: '#8E8E93' }}>({p.teamName})</span>
                        </div>
                        <span style={{ fontWeight: 900, fontSize: '14px', color: idx === 0 ? '#FF9500' : '#4ADE80' }}>
                          {p.goals} {p.goals === 1 ? 'goal' : 'goals'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Playmaker Top Assists */}
              <div
                style={{
                  background: '#0B261D',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '20px' }}>🎯</span>
                  <h3 className="scoreboard" style={{ margin: 0, fontSize: '18px', color: '#FFFFFF' }}>
                    MOST ASSISTS (PLAYMAKERS)
                  </h3>
                </div>

                {activeStats.assists.length === 0 ? (
                  <div style={{ color: '#8E8E93', fontSize: '12px' }}>No assists recorded.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activeStats.assists.slice(0, 10).map((p, idx) => (
                      <div
                        key={p.id}
                        style={{
                          background: '#121212',
                          border: '1px solid #1C1C1E',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: '#121212',
                              color: '#8E8E93',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 800,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: '#FFFFFF' }}>
                            {p.name}
                          </span>
                          <span style={{ fontSize: '11px', color: '#8E8E93' }}>({p.teamName})</span>
                        </div>
                        <span style={{ fontWeight: 800, fontSize: '13px', color: '#FF9500' }}>
                          {p.assists} {p.assists === 1 ? 'assist' : 'assists'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Discipline & Cards */}
              <div
                style={{
                  background: '#0B261D',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '20px' }}>🟨</span>
                  <h3 className="scoreboard" style={{ margin: 0, fontSize: '18px', color: '#FFFFFF' }}>
                    DISCIPLINE &amp; CARDS
                  </h3>
                </div>

                {activeStats.cards.length === 0 ? (
                  <div style={{ color: '#8E8E93', fontSize: '12px' }}>No disciplinary bookings recorded.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activeStats.cards.slice(0, 10).map((p) => (
                      <div
                        key={p.id}
                        style={{
                          background: '#121212',
                          border: '1px solid #1C1C1E',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: '#FFFFFF' }}>
                            {p.name}
                          </span>
                          <span style={{ fontSize: '11px', color: '#8E8E93', marginLeft: '6px' }}>
                            ({p.teamName})
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', fontSize: '12px', fontWeight: 700 }}>
                          {p.yellows > 0 && <span style={{ color: '#FBBF24' }}>🟨 {p.yellows}</span>}
                          {p.reds > 0 && <span style={{ color: '#F87171' }}>🟥 {p.reds}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT 4: CUP PROGRESSION BRACKET (FOR CUPS) */}
          {activeTab === 'bracket' && activeArchive.mode === 'cup' && (
            <CupProgressionView
              cupCategory={activeArchive.catObj}
              cupCategoryKey={activeArchive.key}
              cupCategoriesList={[{ key: activeArchive.key, label: activeArchive.label }]}
              onSelectCupCategory={() => {}}
              isCmsMode={false}
              suspensions={{}}
              onSelectTeam={onSelectTeam}
            />
          )}
        </div>
      )}
    </div>
  );
}
