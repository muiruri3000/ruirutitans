import React, { useState, useEffect, useRef, useMemo } from 'react';
import TopNav from './components/TopNav';
import TableView from './components/TableView';
import FixturesView from './components/FixturesView';
import StatsView from './components/StatsView';
import ManageView from './components/ManageView';
import H2HModal from './components/H2HModal';
import { api } from './api/client';

const PALETTE = [
  '#B23A2E', '#C9A227', '#2E5A8F', '#3F7A4E', '#7A3F8F', '#D97B29',
  '#1F6E5C', '#8F2E5A', '#4E4E4E', '#2E7A7A', '#A2451F', '#3F5A2E',
];

export default function App() {
  const [data, setData] = useState(null);
  const [syncStatus, setSyncStatus] = useState('saving'); // 'synced' | 'saving' | 'error'
  const [currentView, setCurrentView] = useState('table'); // 'table' | 'fixtures' | 'stats' | 'manage'
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatMode, setNewCatMode] = useState('league');

  // H2H state
  const [h2hState, setH2HState] = useState({ open: false, loading: false, data: null, error: null });

  const syncTimerRef = useRef(null);

  // Initial load from Django REST API
  useEffect(() => {
    async function init() {
      try {
        const serverState = await api.getState();
        if (serverState && serverState.categories) {
          setData(serverState);
          setSyncStatus('synced');
        }
      } catch (err) {
        console.warn('Could not load from API, falling back to local cache', err);
        const cached = localStorage.getItem('ruiru_titans_react_state');
        if (cached) {
          setData(JSON.parse(cached));
        }
        setSyncStatus('error');
      }
    }
    init();
  }, []);

  // Commit and sync function
  const commitData = (nextData) => {
    setData(nextData);
    try {
      localStorage.setItem('ruiru_titans_react_state', JSON.stringify(nextData));
    } catch (e) {}

    setSyncStatus('saving');
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    syncTimerRef.current = setTimeout(async () => {
      try {
        await api.saveState(nextData);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync to MySQL:', err);
        setSyncStatus('error');
      }
    }, 300);
  };

  const activeCategoryKey = data?.activeCategory || 'open';
  const cat = data?.categories?.[activeCategoryKey];

  const teamsById = useMemo(() => {
    const map = {};
    cat?.teams?.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [cat]);

  // Compute standings table
  const standingsTable = useMemo(() => {
    if (!cat?.teams || !cat?.fixtures) return [];
    const table = {};
    cat.teams.forEach((t) => {
      table[t.id] = { id: t.id, name: t.name, color: t.color, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
    });

    cat.fixtures.forEach((f) => {
      if (!f.played && !f.walkover) return;
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

      const h = table[f.home];
      const a = table[f.away];
      if (!h || !a) return;

      h.P++; a.P++;
      h.GF += hs; h.GA += as;
      a.GF += as; a.GA += hs;

      if (hs > as) {
        h.W++; h.Pts += 3;
        a.L++;
      } else if (hs < as) {
        a.W++; a.Pts += 3;
        h.L++;
      } else {
        h.D++; a.D++;
        h.Pts += 1; a.Pts += 1;
      }
    });

    const rows = Object.values(table);
    rows.forEach((r) => { r.GD = r.GF - r.GA; });
    return rows.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF);
  }, [cat]);

  // Compute leaderboards
  const leaderboards = useMemo(() => {
    if (!cat) return { scorers: [], assists: [], yellows: [], reds: [] };
    const meta = {};
    cat.teams.forEach((t) =>
      t.players.forEach((p) => {
        if (!p.unknown) {
          meta[p.id] = {
            id: p.id,
            name: p.name,
            teamName: t.name,
            teamColor: t.color,
            goal: 0,
            assist: 0,
            yellow: 0,
            red: 0,
          };
        }
      })
    );

    (cat.fixtures || []).forEach((f) => {
      (f.events || []).forEach((e) => {
        if (e.type === 'goal') {
          if (meta[e.playerId]) meta[e.playerId].goal++;
          if (e.assistPlayerId && meta[e.assistPlayerId]) meta[e.assistPlayerId].assist++;
        } else if (meta[e.playerId]) {
          meta[e.playerId][e.type] = (meta[e.playerId][e.type] || 0) + 1;
        }
      });
    });

    const all = Object.values(meta);
    const top = (k) => all.filter((p) => p[k] > 0).sort((x, y) => y[k] - x[k]).slice(0, 8);
    return {
      scorers: top('goal'),
      assists: top('assist'),
      yellows: top('yellow'),
      reds: top('red'),
    };
  }, [cat]);

  // Compute suspensions
  const suspensions = useMemo(() => {
    if (!cat?.teams || !cat?.fixtures) return {};
    const byFixture = {};
    cat.teams.forEach((team) => {
      let pendingYellows = 0;
      let pendingRed = false;

      cat.fixtures.forEach((f) => {
        const isTeamMatch = f.home === team.id || f.away === team.id;
        if (isTeamMatch) {
          if (pendingRed || pendingYellows >= 3) {
            if (!byFixture[f.id]) byFixture[f.id] = [];
            byFixture[f.id].push({
              teamId: team.id,
              playerName: team.name + ' squad member',
              reason: pendingRed ? 'Red Card' : 'Yellow cards accumulation',
            });
            pendingRed = false;
            pendingYellows = 0;
          }
        }

        // Count cards from this match
        (f.events || []).forEach((e) => {
          if (e.teamId === team.id) {
            if (e.type === 'red') pendingRed = true;
            if (e.type === 'yellow') pendingYellows++;
          }
        });
      });
    });
    return byFixture;
  }, [cat]);

  // Champion detection
  const champion = useMemo(() => {
    if (!cat?.fixtures || cat.fixtures.length === 0) return null;
    const allPlayed = cat.fixtures.every((f) => f.played || f.walkover);
    if (allPlayed && standingsTable.length > 0) {
      return standingsTable[0];
    }
    return null;
  }, [cat, standingsTable]);

  // Handlers for Mutations
  const updateActiveCat = (mutator) => {
    if (!data) return;
    const currentCat = data.categories[activeCategoryKey];
    const nextCat = mutator({ ...currentCat });
    const nextCategories = { ...data.categories, [activeCategoryKey]: nextCat };
    commitData({ ...data, categories: nextCategories });
  };

  const handleTogglePlayed = (fId) => {
    updateActiveCat((c) => {
      const fixtures = c.fixtures.map((f) => {
        if (f.id === fId) {
          return { ...f, played: !f.played };
        }
        return f;
      });
      return { ...c, fixtures };
    });
  };

  const handleAddEvent = (fId, event) => {
    updateActiveCat((c) => {
      const fixtures = c.fixtures.map((f) => {
        if (f.id === fId) {
          const events = [...(f.events || []), event];
          return { ...f, events, played: true };
        }
        return f;
      });
      return { ...c, fixtures };
    });
  };

  const handleRemoveEvent = (fId, eventIndex) => {
    updateActiveCat((c) => {
      const fixtures = c.fixtures.map((f) => {
        if (f.id === fId) {
          const events = [...(f.events || [])];
          events.splice(eventIndex, 1);
          return { ...f, events };
        }
        return f;
      });
      return { ...c, fixtures };
    });
  };

  const handleSetWalkover = (fId, winnerTeamId) => {
    updateActiveCat((c) => {
      const fixtures = c.fixtures.map((f) => {
        if (f.id === fId) {
          return { ...f, walkover: winnerTeamId, played: !!winnerTeamId };
        }
        return f;
      });
      return { ...c, fixtures };
    });
  };

  const handleSetReferee = (fId, refName) => {
    updateActiveCat((c) => {
      const fixtures = c.fixtures.map((f) => {
        if (f.id === fId) {
          return { ...f, referee: refName };
        }
        return f;
      });
      return { ...c, fixtures };
    });
  };

  const handleAddTeam = (name) => {
    updateActiveCat((c) => {
      const code = name.slice(0, 3).toUpperCase();
      const color = PALETTE[c.teams.length % PALETTE.length];
      const newTeam = {
        id: code,
        name: name,
        color: color,
        players: [{ id: `${code}-UNK`, name: 'Unrecorded scorer', unknown: true }],
      };
      return { ...c, teams: [...c.teams, newTeam] };
    });
  };

  const handleAddPlayers = (teamId, names) => {
    updateActiveCat((c) => {
      const teams = c.teams.map((t) => {
        if (t.id === teamId) {
          const currentCount = t.players.length;
          const newPlayers = names.map((n, i) => ({
            id: `${t.id}-P${currentCount + i}`,
            name: n,
            position: '',
          }));
          return { ...t, players: [...t.players, ...newPlayers] };
        }
        return t;
      });
      return { ...c, teams };
    });
  };

  const handleRemovePlayer = (teamId, playerId) => {
    updateActiveCat((c) => {
      const teams = c.teams.map((t) => {
        if (t.id === teamId) {
          return { ...t, players: t.players.filter((p) => p.id !== playerId) };
        }
        return t;
      });
      return { ...c, teams };
    });
  };

  const handleAddReferee = (refName) => {
    updateActiveCat((c) => ({
      ...c,
      referees: [...(c.referees || []), refName],
    }));
  };

  const handleRemoveReferee = (refName) => {
    updateActiveCat((c) => ({
      ...c,
      referees: (c.referees || []).filter((r) => r !== refName),
    }));
  };

  const handleResetRealSeason = async () => {
    if (window.confirm('Reset this category to the official 2026 Ruiru Titans historical season data?')) {
      try {
        const res = await api.resetRealSeason();
        if (res.state) {
          setData(res.state);
          setSyncStatus('synced');
          setCurrentView('table');
        }
      } catch (err) {
        alert('Failed to reset: ' + err.message);
      }
    }
  };

  const handleCreateCategory = (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const slug = newCatName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newCat = {
      label: newCatName.trim(),
      mode: newCatMode,
      format: 'double',
      teams: [],
      fixtures: [],
      schedule: { time: '18:00', days: { 3: 1, 4: 1, 5: 1, 6: 1 } },
      referees: [],
    };
    const nextCategories = { ...data.categories, [slug]: newCat };
    commitData({ categories: nextCategories, activeCategory: slug });
    setNewCatName('');
    setAddingCategory(false);
  };

  const handleDeleteCategory = (catKey) => {
    const nextCategories = { ...data.categories };
    delete nextCategories[catKey];
    const remainingKeys = Object.keys(nextCategories);
    if (remainingKeys.length === 0) {
      alert('Cannot delete the last category.');
      return;
    }
    commitData({ categories: nextCategories, activeCategory: remainingKeys[0] });
  };

  const handleOpenH2H = async (team1Id, team2Id) => {
    setH2HState({ open: true, loading: true, data: null, error: null });
    try {
      const res = await api.getH2H(activeCategoryKey, team1Id, team2Id);
      setH2HState({ open: true, loading: false, data: res, error: null });
    } catch (err) {
      setH2HState({ open: true, loading: false, data: null, error: err.message });
    }
  };

  if (!data || !cat) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B3A2E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#8FA89B' }}>
          <img src="/club-logo.jpg" alt="Ruiru Titans" style={{ width: '64px', height: '64px', marginBottom: '16px', objectFit: 'contain' }} />
          <div style={{ color: '#F4F2EA', fontWeight: 600 }}>Loading Ruiru Titans React Platform…</div>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'table', label: 'Table' },
    { key: 'fixtures', label: 'Fixtures' },
    { key: 'stats', label: 'Stats' },
    { key: 'manage', label: 'Manage' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0B3A2E', fontFamily: 'Inter, sans-serif' }}>
      <TopNav syncStatus={syncStatus} />

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '20px 16px 60px' }}>
        {/* Header */}
        <header style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src="/club-logo.jpg"
            alt="Ruiru Titans crest"
            style={{ width: '56px', height: '56px', objectFit: 'contain', flexShrink: 0 }}
          />
          <div>
            <div style={{ color: '#C9A227', fontSize: '12px', letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>
              Ruiru Titans — League
            </div>
            <h1 className="scoreboard" style={{ color: '#F4F2EA', fontSize: '36px', margin: '4px 0 2px', lineHeight: 1 }}>
              {cat.label.toUpperCase()}
            </h1>
            <div style={{ color: '#8FA89B', fontSize: '12px' }}>
              Double Round-Robin · {cat.teams.length} teams · MySQL Backend
            </div>
          </div>
        </header>

        {/* Category switcher rail */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '14px', overflowX: 'auto', paddingBottom: '4px' }}>
          {Object.entries(data.categories).map(([k, c]) => (
            <button
              key={k}
              className="cat-chip"
              onClick={() => commitData({ ...data, activeCategory: k })}
              style={{
                background: k === activeCategoryKey ? '#C9A227' : '#16352A',
                color: k === activeCategoryKey ? '#16201B' : '#DDE6DF',
                fontWeight: 700,
                fontSize: '12px',
                padding: '6px 14px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {c.label}
            </button>
          ))}

          <button
            onClick={() => setAddingCategory(!addingCategory)}
            style={{
              background: 'transparent',
              border: '1px dashed #2B4E40',
              color: '#8FA89B',
              fontSize: '12px',
              padding: '5px 12px',
              borderRadius: '999px',
              cursor: 'pointer',
            }}
          >
            {addingCategory ? '✕ Cancel' : '+ Category'}
          </button>
        </div>

        {/* Add Category Form */}
        {addingCategory && (
          <form onSubmit={handleCreateCategory} style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: '#0F2E24', padding: '10px', borderRadius: '8px' }}>
            <input
              className="form-input"
              placeholder="Category name (e.g. Under 20s, Cup 2026)…"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
            <button type="submit" className="stat-btn" style={{ background: '#C9A227', color: '#16201B', fontWeight: 700 }}>
              Create
            </button>
          </form>
        )}

        {/* Champion Banner */}
        {champion && (
          <div
            style={{
              background: '#C9A227',
              color: '#16201B',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              marginBottom: '20px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              OFFICIAL SEASON CHAMPION
            </div>
            <div className="scoreboard" style={{ fontSize: '32px', margin: '4px 0' }}>
              🏆 {champion.name.toUpperCase()} 🏆
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600 }}>
              Finished top with {champion.Pts} points and a goal difference of {champion.GD > 0 ? `+${champion.GD}` : champion.GD}
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '22px', background: '#0F2E24', padding: '5px', borderRadius: '12px', border: '1px solid #1E4636' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className="tab-btn"
              onClick={() => setCurrentView(t.key)}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: currentView === t.key ? '#C9A227' : 'transparent',
                color: currentView === t.key ? '#16201B' : '#8FA89B',
                fontWeight: 700,
                fontSize: '12.5px',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Views */}
        {currentView === 'table' && (
          <TableView
            table={standingsTable}
            teamCount={cat.teams.length}
            activeCategoryKey={activeCategoryKey}
          />
        )}

        {currentView === 'fixtures' && (
          <FixturesView
            fixtures={cat.fixtures}
            teamsById={teamsById}
            suspensions={suspensions}
            referees={cat.referees}
            activeCategoryKey={activeCategoryKey}
            onTogglePlayed={handleTogglePlayed}
            onAddEvent={handleAddEvent}
            onRemoveEvent={handleRemoveEvent}
            onSetWalkover={handleSetWalkover}
            onSetReferee={handleSetReferee}
            onOpenH2H={handleOpenH2H}
          />
        )}

        {currentView === 'stats' && (
          <StatsView
            leaderboards={leaderboards}
            activeCategoryKey={activeCategoryKey}
          />
        )}

        {currentView === 'manage' && (
          <ManageView
            cat={cat}
            activeCategoryKey={activeCategoryKey}
            onAddTeam={handleAddTeam}
            onAddPlayers={handleAddPlayers}
            onRemovePlayer={handleRemovePlayer}
            onAddReferee={handleAddReferee}
            onRemoveReferee={handleRemoveReferee}
            onDeleteCategory={handleDeleteCategory}
            onResetRealSeason={handleResetRealSeason}
          />
        )}

        {/* Note footer */}
        {cat.note && (
          <div style={{ marginTop: '18px', fontSize: '11px', color: '#5E7A6C', textAlign: 'center', lineHeight: 1.6 }}>
            {cat.note}
          </div>
        )}
      </div>

      {/* Head-to-Head Modal */}
      {h2hState.open && (
        <H2HModal
          data={h2hState.data}
          loading={h2hState.loading}
          error={h2hState.error}
          onClose={() => setH2HState({ open: false, loading: false, data: null, error: null })}
        />
      )}
    </div>
  );
}

