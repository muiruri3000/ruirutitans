import React, { useState, useEffect, useRef, useMemo } from 'react';
import TopNav from './components/TopNav';
import ClubHomeView from './components/ClubHomeView';
import TableView from './components/TableView';
import FixturesView from './components/FixturesView';
import CupProgressionView from './components/CupProgressionView';
import StatsView from './components/StatsView';
import ManageView from './components/ManageView';
import TeamBalancerView from './components/TeamBalancerView';
import VotingView from './components/VotingView';
import H2HModal from './components/H2HModal';
import AuthModal from './components/AuthModal';
import TeamDetailModal from './components/TeamDetailModal';
import PlayerDashboardView from './components/PlayerDashboardView';
import HighlightsView from './components/HighlightsView';
import ArchivesView from './components/ArchivesView';
import { openCategoryFixturesResultsPDF } from './utils/pdfExport';
import { api } from './api/client';
import { DEFAULT_TITANS_STATE, CORE_FIVE_TEAMS } from './data/defaultState';

const PALETTE = [
  '#B23A2E', '#C9A227', '#2E5A8F', '#3F7A4E', '#7A3F8F', '#D97B29',
  '#1F6E5C', '#8F2E5A', '#4E4E4E', '#2E7A7A', '#A2451F', '#3F5A2E',
];

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

function collectOrderedCategoryFixtures(catObj) {
  if (!catObj) return [];
  const rawList = [];
  const seenIds = new Set();

  const pushFixture = (f) => {
    if (!f || !f.id || seenIds.has(f.id)) return;
    seenIds.add(f.id);
    rawList.push(f);
  };

  Object.values(catObj.groupFixtures || {}).forEach((flist) => {
    (flist || []).forEach(pushFixture);
  });

  (catObj.fixtures || []).forEach(pushFixture);

  (catObj.rounds || []).forEach((rTies, rIdx) => {
    (Array.isArray(rTies) ? rTies : rTies?.ties || []).forEach((tie, tIdx) => {
      if (!tie) return;
      const fId = tie.id || `KO-R${rIdx + 1}-T${tIdx + 1}`;
      const matchObj = tie.match || {};
      pushFixture({
        id: fId,
        home: tie.home,
        away: tie.away,
        played: Boolean(matchObj.played ?? tie.played),
        walkover: matchObj.walkover ?? tie.walkover,
        events: matchObj.events || tie.events || [],
      });
    });
  });

  const activeOrPlayed = rawList.filter(
    (f) => f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0)
  );
  const upcomingUnplayed = rawList.filter(
    (f) => !(f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0))
  );
  return [...activeOrPlayed, ...upcomingUnplayed];
}

function computeCategorySuspensions(catObj) {
  if (!catObj?.teams) return {};
  const orderedFixtures = collectOrderedCategoryFixtures(catObj);
  if (orderedFixtures.length === 0) return {};

  const teamsMap = {};
  const playerState = {};

  (catObj.teams || []).forEach((team) => {
    teamsMap[team.id] = team;
    (team.players || []).forEach((p) => {
      const key = `${team.id}::${p.id}`;
      playerState[key] = {
        teamId: team.id,
        teamName: team.name,
        playerId: p.id,
        playerName: p.unknown ? `${team.name} squad member` : p.name,
        pendingYellows: 0,
        pendingRed: false,
        yellowInterference: false,
        redInterference: false,
        lastCardFixtureId: null,
      };
    });
  });

  const byFixture = {};

  orderedFixtures.forEach((f) => {
    const homeId = f.home;
    const awayId = f.away;

    // 1. Players on either team playing in this fixture who have a pending red card
    // or >= 4 accumulated yellow cards miss this match (serving their suspension).
    Object.values(playerState).forEach((st) => {
      if (st.teamId && (st.teamId === homeId || st.teamId === awayId)) {
        if (st.pendingRed || st.pendingYellows >= 4) {
          const isInterf = st.pendingRed ? st.redInterference : st.yellowInterference;
          const srcFix = st.lastCardFixtureId;
          let reason = '';
          if (st.pendingRed && st.pendingYellows >= 4) {
            reason = `Red Card & ${st.pendingYellows} Yellow Cards Accumulation`;
          } else if (st.pendingRed) {
            reason = isInterf
              ? `Red Card (Sideline Interference${srcFix ? ` in ${srcFix}` : ''})`
              : 'Red Card — Misses Next Match';
          } else {
            reason = isInterf
              ? `${st.pendingYellows} Yellow Cards Accumulation (incl. Interference${srcFix ? ` in ${srcFix}` : ''})`
              : `${st.pendingYellows} Yellow Cards Accumulation — Misses Next Match`;
          }

          if (!byFixture[f.id]) byFixture[f.id] = [];
          byFixture[f.id].push({
            teamId: st.teamId,
            teamName: st.teamName,
            playerId: st.playerId,
            playerName: st.playerName,
            reason,
            interference: Boolean(isInterf),
            sourceFixtureId: srcFix,
          });

          if (st.pendingRed) {
            st.pendingRed = false;
            st.redInterference = false;
          }
          if (st.pendingYellows >= 4) {
            st.pendingYellows -= 4;
            if (st.pendingYellows < 4) {
              st.yellowInterference = false;
            }
          }
        }
      }
    });

    // 2. Process cards issued during this fixture (including interference cards to players from non-playing teams)
    (f.events || []).forEach((e) => {
      if (e.type !== 'yellow' && e.type !== 'red') return;
      const tId = e.teamId;
      if (!tId) return;
      const pId = e.playerId || `${tId}-UNK`;
      const key = `${tId}::${pId}`;
      if (!playerState[key]) {
        const tObj = teamsMap[tId];
        const pObj = tObj?.players?.find((pp) => pp.id === pId);
        playerState[key] = {
          teamId: tId,
          teamName: tObj?.name || tId,
          playerId: pId,
          playerName: pObj && !pObj.unknown ? pObj.name : `${tObj?.name || tId} squad member`,
          pendingYellows: 0,
          pendingRed: false,
          yellowInterference: false,
          redInterference: false,
          lastCardFixtureId: null,
        };
      }
      const st = playerState[key];
      const isInterf = Boolean(
        e.interference || (homeId && awayId && tId !== homeId && tId !== awayId)
      );
      st.lastCardFixtureId = f.id;
      if (e.type === 'yellow') {
        st.pendingYellows += 1;
        if (isInterf) st.yellowInterference = true;
      } else if (e.type === 'red') {
        st.pendingRed = true;
        if (isInterf) st.redInterference = true;
      }
    });
  });

  return byFixture;
}

export default function App() {
  const [data, setData] = useState(() => DEFAULT_TITANS_STATE);
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced' | 'saving' | 'error'
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'table' | 'fixtures' | 'cup' | 'voting' | 'stats' | 'manage'
  const [fixturesInitialFilter, setFixturesInitialFilter] = useState('all');
  const [votingInitialTab, setVotingInitialTab] = useState('totw');

  // Authentication & CMS Mode State
  const [cmsUser, setCmsUser] = useState(null);
  const [playerUser, setPlayerUser] = useState(null);
  const [isCmsMode, setIsCmsMode] = useState(false);
  const [authModal, setAuthModal] = useState({ open: false, tab: 'cms' });
  const [manageSection, setManageSection] = useState('players');

  // Category creation state (in CMS mode)
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatMode, setNewCatMode] = useState('league');
  const [newCatRefs, setNewCatRefs] = useState('Ref Kamau, Ref Otieno, Ref Njoroge');

  // H2H Modal state
  const [h2hState, setH2HState] = useState({ open: false, loading: false, data: null, error: null });

  // Team Analytics & Profile Modal state
  const [teamModalState, setTeamModalState] = useState({ open: false, teamId: null, categoryKey: null });

  const syncTimerRef = useRef(null);

  // Initial load from Django REST API + Player Auth Session check
  useEffect(() => {
    async function init() {
      try {
        const [serverState, sessionInfo] = await Promise.all([
          api.getState(),
          api.getAuthSession().catch(() => ({ cms: null, player: null })),
        ]);
        if (serverState && serverState.categories) {
          setData(serverState);
          setSyncStatus('synced');
        }
        if (sessionInfo?.cms) {
          setCmsUser(sessionInfo.cms);
          setPlayerUser(null);
        } else if (sessionInfo?.player) {
          setPlayerUser(sessionInfo.player);
          setCmsUser(null);
        } else {
          setCmsUser(null);
          setPlayerUser(null);
        }
      } catch (err) {
        console.warn('Could not load from API, using fallback state', err);
      }
    }
    init();
  }, []);

  // Commit and sync function (debounced so UI clicks/selects never freeze)
  const commitData = (nextData) => {
    setData(nextData);
    setSyncStatus('saving');
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    syncTimerRef.current = setTimeout(async () => {
      try {
        try {
          localStorage.setItem('ruiru_titans_react_state', JSON.stringify(nextData));
        } catch (e) {}
        await api.saveState(nextData);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync to backend:', err);
        setSyncStatus('error');
      }
    }, 400);
  };

  // Fast category switching without blocking UI or re-saving full database
  const handleSelectActiveCategory = (catKey) => {
    if (!catKey || data.activeCategory === catKey) return;
    setData((prev) => ({ ...prev, activeCategory: catKey }));
    setTimeout(() => {
      try {
        localStorage.setItem('ruiru_titans_active_category', catKey);
      } catch {}
    }, 0);
  };

  // Find League and Cup categories
  const leagueCategoryKey = useMemo(() => {
    if (!data?.categories) return 'open';
    const active = data.activeCategory;
    if (active && data.categories[active]?.mode === 'league') return active;
    const found = Object.keys(data.categories).find((k) => data.categories[k]?.mode === 'league');
    return found || Object.keys(data.categories)[0] || 'open';
  }, [data]);

  const cupCategoryKey = useMemo(() => {
    if (!data?.categories) return 'titans-cup';
    const active = data.activeCategory;
    if (active && data.categories[active]?.mode === 'cup') return active;
    const found = Object.keys(data.categories).find((k) => data.categories[k]?.mode === 'cup');
    return found || 'titans-cup';
  }, [data]);

  const activeCategoryKey = data?.activeCategory || 'open';
  const cat = data?.categories?.[activeCategoryKey] || data?.categories?.[leagueCategoryKey];
  const leagueCat = data?.categories?.[leagueCategoryKey] || cat;
  const cupCat = data?.categories?.[cupCategoryKey];

  const teamsById = useMemo(() => {
    const map = {};
    cat?.teams?.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [cat]);

  const leagueTeamsById = useMemo(() => {
    const map = {};
    leagueCat?.teams?.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [leagueCat]);

  // Compute standings table for League
  const standingsTable = useMemo(() => {
    const targetCat = cat?.mode === 'league' ? cat : leagueCat;
    if (!targetCat?.teams || !targetCat?.fixtures) return [];
    const table = {};
    targetCat.teams.forEach((t) => {
      table[t.id] = { id: t.id, name: t.name, color: t.color, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0, form: [] };
    });

    targetCat.fixtures.forEach((f) => {
      if (!f.played && !f.walkover) return;
      const { hs, as } = computeFixtureScore(f);

      const h = table[f.home];
      const a = table[f.away];
      if (!h || !a) return;

      h.P++; a.P++;
      h.GF += hs; h.GA += as;
      a.GF += as; a.GA += hs;

      if (hs > as) {
        h.W++; h.Pts += 3; h.form.push('W');
        a.L++; a.form.push('L');
      } else if (hs < as) {
        a.W++; a.Pts += 3; a.form.push('W');
        h.L++; h.form.push('L');
      } else {
        h.D++; a.D++;
        h.Pts += 1; a.Pts += 1;
        h.form.push('D'); a.form.push('D');
      }
    });

    const rows = Object.values(table);
    rows.forEach((r) => { r.GD = r.GF - r.GA; });
    return rows.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF);
  }, [cat, leagueCat]);

  // Compute leaderboards grouped by every category created
  const leaderboardsByCategory = useMemo(() => {
    const result = {};
    Object.entries(data?.categories || {}).forEach(([catKey, catObj]) => {
      if (!catObj) return;
      const meta = {};
      (catObj.teams || []).forEach((t) =>
        (t.players || []).forEach((p) => {
          if (!p.unknown) {
            meta[p.id] = {
              id: p.id,
              permanentId: p.permanentId || p.id,
              name: p.name,
              position: p.position || '',
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

      let totalGoals = 0;
      let totalAssists = 0;
      let totalYellows = 0;
      let totalReds = 0;

      const processEvents = (events) => {
        (events || []).forEach((e) => {
          if (e.type === 'goal') {
            totalGoals++;
            if (meta[e.playerId]) meta[e.playerId].goal++;
            if (e.assistPlayerId) {
              totalAssists++;
              if (meta[e.assistPlayerId]) meta[e.assistPlayerId].assist++;
            }
          } else if (e.type === 'assist') {
            totalAssists++;
            if (meta[e.playerId]) meta[e.playerId].assist++;
          } else if (e.type === 'owngoal') {
            totalGoals++;
          } else if (e.type === 'yellow') {
            totalYellows++;
            if (meta[e.playerId]) meta[e.playerId].yellow++;
          } else if (e.type === 'red') {
            totalReds++;
            if (meta[e.playerId]) meta[e.playerId].red++;
          } else if (meta[e.playerId]) {
            meta[e.playerId][e.type] = (meta[e.playerId][e.type] || 0) + 1;
          }
        });
      };

      const uniqueFixtures = collectOrderedCategoryFixtures(catObj);
      uniqueFixtures.forEach((f) => processEvents(f.events));

      const all = Object.values(meta);
      const top = (k) => all.filter((p) => p[k] > 0).sort((x, y) => y[k] - x[k]).slice(0, 8);
      result[catKey] = {
        scorers: top('goal'),
        assists: top('assist'),
        yellows: top('yellow'),
        reds: top('red'),
        totals: {
          goals: totalGoals,
          assists: totalAssists,
          yellows: totalYellows,
          reds: totalReds,
        },
      };
    });
    return result;
  }, [data?.categories]);

  const leaderboards = useMemo(() => {
    return (
      leaderboardsByCategory[activeCategoryKey] || {
        scorers: [],
        assists: [],
        yellows: [],
        reds: [],
      }
    );
  }, [leaderboardsByCategory, activeCategoryKey]);

  // Compute suspensions (4 yellows = player misses next match; red card = player misses next match;
  // interference bookings for players from non-playing teams take effect in their actual team's next fixture)
  const suspensions = useMemo(() => computeCategorySuspensions(cat), [cat]);
  const cupSuspensions = useMemo(() => computeCategorySuspensions(cupCat || cat), [cupCat, cat]);

  // Quick club stats for Hero Banner
  const clubMetrics = useMemo(() => {
    const lFixtures = leagueCat?.fixtures || [];
    const completedResults = lFixtures.filter((f) => f.played || f.walkover);
    const upcomingFixtures = lFixtures.filter((f) => !f.played && !f.walkover);
    let totalGoals = 0;
    lFixtures.forEach((f) => {
      const { hs, as } = computeFixtureScore(f);
      totalGoals += hs + as;
    });
    const cupRoundsCount = cupCat?.rounds?.length || 3;
    return {
      teamsCount: leagueCat?.teams?.length || 0,
      completedCount: completedResults.length,
      upcomingCount: upcomingFixtures.length,
      totalGoals,
      cupRoundsCount,
      recentResults: completedResults.slice(-4).reverse(),
      nextFixtures: upcomingFixtures.slice(0, 4),
    };
  }, [leagueCat, cupCat]);

  // Handlers for Mutations (for specific category or active category)
  const updateCategoryByKey = (catKey, mutator) => {
    if (!data || !data.categories[catKey]) return;
    const currentCat = data.categories[catKey];
    const nextCat = mutator({ ...currentCat });
    const nextCategories = { ...data.categories, [catKey]: nextCat };
    commitData({ ...data, categories: nextCategories });
  };

  const updateActiveCat = (mutator) => {
    updateCategoryByKey(activeCategoryKey, mutator);
  };

  const syncCupGroupFixtures = (c, nextFixtures) => {
    if (!c.groupFixtures) return undefined;
    const byId = {};
    (nextFixtures || []).forEach((f) => {
      byId[f.id] = f;
    });
    const nextGroupFixtures = {};
    Object.entries(c.groupFixtures).forEach(([letter, list]) => {
      nextGroupFixtures[letter] = (list || []).map((gf) => byId[gf.id] || gf);
    });
    return nextGroupFixtures;
  };

  const handleTogglePlayed = (fId, targetKey = activeCategoryKey) => {
    updateCategoryByKey(targetKey, (c) => {
      const fixtures = (c.fixtures || []).map((f) => (f.id === fId ? { ...f, played: !f.played } : f));
      const groupFixtures = syncCupGroupFixtures(c, fixtures);
      const rounds = (c.rounds || []).map((r) =>
        Array.isArray(r)
          ? r.map((t) => (t?.id === fId ? { ...t, match: { ...t.match, played: !t.match?.played } } : t))
          : {
              ...r,
              ties: (r.ties || []).map((t) => (t.id === fId ? { ...t, played: !t.played } : t)),
            }
      );
      return { ...c, fixtures, ...(groupFixtures ? { groupFixtures } : {}), rounds };
    });
  };

  const handleAddEvent = (fId, event, targetKey = activeCategoryKey) => {
    updateCategoryByKey(targetKey, (c) => {
      const fixtures = (c.fixtures || []).map((f) => {
        if (f.id === fId) {
          const events = [...(f.events || []), event];
          return { ...f, events, played: true };
        }
        return f;
      });
      const groupFixtures = syncCupGroupFixtures(c, fixtures);
      return { ...c, fixtures, ...(groupFixtures ? { groupFixtures } : {}) };
    });
  };

  const handleRemoveEvent = (fId, eventIndex, targetKey = activeCategoryKey) => {
    updateCategoryByKey(targetKey, (c) => {
      const fixtures = (c.fixtures || []).map((f) => {
        if (f.id === fId) {
          const events = [...(f.events || [])];
          events.splice(eventIndex, 1);
          return { ...f, events };
        }
        return f;
      });
      const groupFixtures = syncCupGroupFixtures(c, fixtures);
      return { ...c, fixtures, ...(groupFixtures ? { groupFixtures } : {}) };
    });
  };

  const handleSetWalkover = (fId, winnerTeamId, targetKey = activeCategoryKey) => {
    updateCategoryByKey(targetKey, (c) => {
      const fixtures = (c.fixtures || []).map((f) => {
        if (f.id === fId) {
          return { ...f, walkover: winnerTeamId, played: !!winnerTeamId };
        }
        return f;
      });
      const groupFixtures = syncCupGroupFixtures(c, fixtures);
      return { ...c, fixtures, ...(groupFixtures ? { groupFixtures } : {}) };
    });
  };

  const handleSetReferee = (fId, refName, targetKey = activeCategoryKey) => {
    updateCategoryByKey(targetKey, (c) => {
      const fixtures = (c.fixtures || []).map((f) =>
        f.id === fId && !f.played && !f.walkover ? { ...f, referee: refName } : f
      );
      const groupFixtures = syncCupGroupFixtures(c, fixtures);
      const rounds = (c.rounds || []).map((r) =>
        Array.isArray(r)
          ? r.map((t) =>
              t?.id === fId && !t.match?.played
                ? { ...t, referee: refName, match: { ...(t.match || {}), referee: refName } }
                : t
            )
          : r
      );
      return { ...c, fixtures, ...(groupFixtures ? { groupFixtures } : {}), ...(c.rounds ? { rounds } : {}) };
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

  const handleAddPlayers = (teamId, names, position = 'CM', customUsername = '', customPassword = '') => {
    updateActiveCat((c) => {
      const teams = c.teams.map((t) => {
        if (t.id === teamId) {
          const existingIds = new Set(t.players.map((p) => p.id));
          let nextSeq = 1;
          t.players.forEach((p) => {
            const match = String(p.id || '').match(/-P(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num >= nextSeq) nextSeq = num + 1;
            }
          });
          const newPlayers = names.map((n, idx) => {
            while (existingIds.has(`${t.id}-P${nextSeq}`)) {
              nextSeq++;
            }
            const permId = `${t.id}-P${nextSeq}`;
            existingIds.add(permId);
            nextSeq++;
            const defaultUname =
              n
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_|_$/g, '') || permId.toLowerCase();
            return {
              id: permId,
              permanentId: permId,
              name: n,
              username: idx === 0 && customUsername.trim() ? customUsername.trim().toLowerCase() : defaultUname,
              password: customPassword.trim() || 'titans2026',
              position: position || 'CM',
            };
          });
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

  const handleUpdatePlayerPosition = (teamId, playerId, newPosition) => {
    updateActiveCat((c) => {
      const teams = c.teams.map((t) => {
        if (t.id === teamId) {
          return {
            ...t,
            players: t.players.map((p) => (p.id === playerId ? { ...p, position: newPosition } : p)),
          };
        }
        return t;
      });
      return { ...c, teams };
    });
  };

  const handleTogglePlayerStatus = (teamId, playerId, newStatus) => {
    updateActiveCat((c) => {
      const teams = c.teams.map((t) => {
        if (t.id === teamId) {
          return {
            ...t,
            players: t.players.map((p) =>
              p.id === playerId ? { ...p, isActive: newStatus, is_active: newStatus } : p
            ),
          };
        }
        return t;
      });
      return { ...c, teams };
    });
  };

  const handleReleasePlayerJersey = (teamId, playerId) => {
    updateActiveCat((c) => {
      const teams = c.teams.map((t) => {
        if (t.id === teamId) {
          return {
            ...t,
            players: t.players.map((p) =>
              p.id === playerId ? { ...p, jerseyNumber: null, jersey_number: null } : p
            ),
          };
        }
        return t;
      });
      return { ...c, teams };
    });
  };

  const pickRandomReferee = (refList) => {
    if (!refList || refList.length === 0) return '';
    return refList[Math.floor(Math.random() * refList.length)];
  };

  const handleAddReferee = (refNameInput, targetKey = activeCategoryKey) => {
    const names = String(refNameInput || '')
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    updateCategoryByKey(targetKey, (c) => {
      const existing = c.referees || [];
      const merged = [...existing];
      names.forEach((n) => {
        if (!merged.includes(n)) merged.push(n);
      });

      // Automatically assign random referees to any unplayed fixtures that don't have one yet
      const fixtures = (c.fixtures || []).map((f) =>
        !f.played && !f.walkover && !f.referee
          ? { ...f, referee: pickRandomReferee(merged) }
          : f
      );
      const groupFixtures = syncCupGroupFixtures(c, fixtures);
      const rounds = c.rounds
        ? (c.rounds || []).map((r) =>
            Array.isArray(r)
              ? r.map((t) => {
                  if (!t || t.match?.played || t.referee || t.match?.referee) return t;
                  const rand = pickRandomReferee(merged);
                  return { ...t, referee: rand, match: { ...(t.match || {}), referee: rand } };
                })
              : r
          )
        : undefined;

      return {
        ...c,
        referees: merged,
        fixtures,
        ...(groupFixtures ? { groupFixtures } : {}),
        ...(rounds ? { rounds } : {}),
      };
    });
  };

  const handleRemoveReferee = (refName, targetKey = activeCategoryKey) => {
    updateCategoryByKey(targetKey, (c) => ({
      ...c,
      referees: (c.referees || []).filter((r) => r !== refName),
    }));
  };

  const handleRandomizeReferees = (targetKey = activeCategoryKey) => {
    const targetCat = data?.categories?.[targetKey];
    const refPool = targetCat?.referees || [];
    if (refPool.length === 0) return 0;

    let updatedCount = 0;
    updateCategoryByKey(targetKey, (c) => {
      const pool = c.referees || [];
      if (pool.length === 0) return c;

      const fixtures = (c.fixtures || []).map((f) => {
        if (f.played || f.walkover) return f;
        updatedCount++;
        return { ...f, referee: pickRandomReferee(pool) };
      });
      const groupFixtures = syncCupGroupFixtures(c, fixtures);
      const rounds = c.rounds
        ? (c.rounds || []).map((r) =>
            Array.isArray(r)
              ? r.map((t) => {
                  if (!t || t.match?.played) return t;
                  updatedCount++;
                  const rand = pickRandomReferee(pool);
                  return { ...t, referee: rand, match: { ...(t.match || {}), referee: rand } };
                })
              : r
          )
        : undefined;

      return {
        ...c,
        fixtures,
        ...(groupFixtures ? { groupFixtures } : {}),
        ...(rounds ? { rounds } : {}),
      };
    });
    return updatedCount;
  };

  const handleUpdateHomepage = async (nextHomepage) => {
    const nextData = {
      ...data,
      homepage: nextHomepage,
    };
    commitData(nextData);
    try {
      await api.saveHomepage(nextHomepage);
    } catch (err) {
      console.warn('Could not save homepage directly, synced via state API:', err);
    }
  };

  const handleUpdateVotingConfig = async (nextVotingConfig) => {
    updateActiveCat((c) => ({
      ...c,
      votingConfig: {
        ...(c.votingConfig || { team_size: 6, max_picks_per_position: 2, include_gk: true }),
        ...nextVotingConfig,
      },
    }));
    try {
      await api.toggleVotingRound(activeCategoryKey, nextVotingConfig);
    } catch (err) {
      console.warn('Updated voting config in state:', err);
    }
  };

  const handleResetRealSeason = async () => {
    if (window.confirm('Reset this category to the official 2026 Ruiru Titans season & cup data?')) {
      try {
        const res = await api.resetRealSeason();
        if (res.state) {
          setData(res.state);
          setSyncStatus('synced');
          setCurrentView('home');
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
    const parsedRefs = String(newCatRefs || '')
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const initialTeams = CORE_FIVE_TEAMS.map((t) => ({ ...t, players: [] }));
    const newCat = {
      label: newCatName.trim(),
      mode: newCatMode,
      format: 'double',
      teams: initialTeams,
      fixtures: [],
      schedule: { time: '18:00', days: { 3: 1, 4: 1, 5: 1, 6: 1 } },
      referees: parsedRefs,
      votingConfig: { team_size: 6, max_picks_per_position: 2, include_gk: true },
    };
    const nextCategories = { ...data.categories, [slug]: newCat };
    commitData({ ...data, categories: nextCategories, activeCategory: slug });
    setNewCatName('');
    setAddingCategory(false);
  };

  const computeScheduleSlots = (totalFixtures, schedule = {}) => {
    const defaultKickoff = schedule?.time || '15:00';
    const defaultMatchesPerDay = Math.max(1, parseInt(schedule?.matches_per_day || schedule?.fixtures_per_day || 1, 10));

    // Per-day configuration map (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
    const dayConfig = {};
    for (let d = 0; d < 7; d++) {
      dayConfig[d] = {
        enabled: false,
        matches: defaultMatchesPerDay,
        time: defaultKickoff,
      };
    }

    const rawDays = schedule?.days;
    if (Array.isArray(rawDays)) {
      rawDays.forEach((item) => {
        if (typeof item === 'number') {
          dayConfig[item] = { enabled: true, matches: defaultMatchesPerDay, time: defaultKickoff };
        } else if (item && typeof item === 'object') {
          const dNum = Number(item.day ?? item.num ?? item.dayNum);
          if (!isNaN(dNum) && dNum >= 0 && dNum <= 6) {
            dayConfig[dNum] = {
              enabled: item.enabled !== false,
              matches: Math.max(1, parseInt(item.matches || item.count || defaultMatchesPerDay, 10)),
              time: item.time || defaultKickoff,
            };
          }
        }
      });
    } else if (rawDays && typeof rawDays === 'object') {
      Object.entries(rawDays).forEach(([k, v]) => {
        const dNum = Number(k);
        if (!isNaN(dNum) && dNum >= 0 && dNum <= 6) {
          if (typeof v === 'number') {
            dayConfig[dNum] = { enabled: v > 0, matches: Math.max(1, v), time: defaultKickoff };
          } else if (typeof v === 'boolean') {
            dayConfig[dNum] = { enabled: v, matches: defaultMatchesPerDay, time: defaultKickoff };
          } else if (v && typeof v === 'object') {
            dayConfig[dNum] = {
              enabled: v.enabled !== false,
              matches: Math.max(1, parseInt(v.matches || v.count || defaultMatchesPerDay, 10)),
              time: v.time || defaultKickoff,
            };
          }
        }
      });
    }

    // Fallback: If no days enabled, default to Saturday (6) and Sunday (0)
    const enabledDays = Object.keys(dayConfig)
      .map(Number)
      .filter((d) => dayConfig[d].enabled);

    if (!enabledDays.length) {
      dayConfig[6].enabled = true;
      dayConfig[0].enabled = true;
      enabledDays.push(6, 0);
    }
    enabledDays.sort((a, b) => a - b);

    const baseDate = new Date(2026, 3, 18); // Sat, 18 Apr 2026
    const cur = new Date(baseDate.getTime());
    while (!dayConfig[cur.getDay()].enabled) {
      cur.setDate(cur.getDate() + 1);
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const slots = [];
    let dayMatchIndex = 0;

    for (let i = 0; i < totalFixtures; i++) {
      const curDay = cur.getDay();
      const cfg = dayConfig[curDay];
      const maxMatchesToday = cfg.matches || defaultMatchesPerDay;

      if (dayMatchIndex >= maxMatchesToday) {
        do {
          cur.setDate(cur.getDate() + 1);
        } while (!dayConfig[cur.getDay()].enabled);
        dayMatchIndex = 0;
      }

      const todayCfg = dayConfig[cur.getDay()];
      const [hBaseStr, mBaseStr] = (todayCfg.time || defaultKickoff).split(':');
      const hBase = parseInt(hBaseStr || '15', 10);
      const mBase = parseInt(mBaseStr || '00', 10);

      // The difference between games played on the same day is exactly 1 hour!
      const totalMinutes = hBase * 60 + mBase + dayMatchIndex * 60;
      const matchHour = Math.floor(totalMinutes / 60) % 24;
      const matchMin = totalMinutes % 60;

      const timeStr = `${String(matchHour).padStart(2, '0')}:${String(matchMin).padStart(2, '0')}`;
      const dateLabel = `${dayNames[cur.getDay()]}, ${String(cur.getDate()).padStart(2, '0')} ${monthNames[cur.getMonth()]} · ${timeStr}`;
      slots.push(dateLabel);
      dayMatchIndex++;
    }

    return slots;
  };

  const handleUpdateSchedule = (targetKey, newSchedule, applyToUnplayed = false) => {
    updateCategoryByKey(targetKey, (c) => {
      const mergedSchedule = {
        ...(c.schedule || { time: '15:00', days: { 6: { enabled: true, matches: 2 }, 0: { enabled: true, matches: 2 } }, matches_per_day: 1 }),
        ...newSchedule,
      };

      if (!applyToUnplayed) {
        return { ...c, schedule: mergedSchedule };
      }

      // Re-assign dates for unplayed fixtures using the new schedule configuration
      const unplayedFixtures = (c.fixtures || []).filter((f) => !f.played && !f.walkover);
      const newSlots = computeScheduleSlots(unplayedFixtures.length, mergedSchedule);
      let slotIdx = 0;
      const updatedFixtures = (c.fixtures || []).map((f) => {
        if (!f.played && !f.walkover) {
          const nextDate = newSlots[slotIdx] || f.date;
          slotIdx++;
          return { ...f, date: nextDate };
        }
        return f;
      });

      const updatedGroupFixtures = syncCupGroupFixtures(c, updatedFixtures);
      const updatedRounds = c.rounds
        ? (c.rounds || []).map((r) =>
            Array.isArray(r)
              ? r.map((t) => {
                  if (!t || t.match?.played) return t;
                  const matchFix = updatedFixtures.find((uf) => uf.id === t.id);
                  if (matchFix) {
                    return { ...t, date: matchFix.date, match: { ...(t.match || {}), date: matchFix.date } };
                  }
                  return t;
                })
              : r
          )
        : undefined;

      return {
        ...c,
        schedule: mergedSchedule,
        fixtures: updatedFixtures,
        ...(updatedGroupFixtures ? { groupFixtures: updatedGroupFixtures } : {}),
        ...(updatedRounds ? { rounds: updatedRounds } : {}),
      };
    });
  };

  const handleMoveFixtureDate = (targetKey, fixtureId, newDateStr) => {
    if (!newDateStr) return;
    updateCategoryByKey(targetKey, (c) => {
      const updatedFixtures = (c.fixtures || []).map((f) => {
        if (f.id === fixtureId) {
          return { ...f, date: newDateStr, is_rescheduled: true };
        }
        return f;
      });

      const updatedGroupFixtures = syncCupGroupFixtures(c, updatedFixtures);
      const updatedRounds = c.rounds
        ? (c.rounds || []).map((r) =>
            Array.isArray(r)
              ? r.map((t) => {
                  if (t && t.id === fixtureId) {
                    return {
                      ...t,
                      date: newDateStr,
                      is_rescheduled: true,
                      match: { ...(t.match || {}), date: newDateStr, is_rescheduled: true },
                    };
                  }
                  return t;
                })
              : r
          )
        : undefined;

      return {
        ...c,
        fixtures: updatedFixtures,
        ...(updatedGroupFixtures ? { groupFixtures: updatedGroupFixtures } : {}),
        ...(updatedRounds ? { rounds: updatedRounds } : {}),
      };
    });
  };

  const handleBatchMoveFixtures = (targetKey, fixtureDateMap) => {
    if (!fixtureDateMap || !Object.keys(fixtureDateMap).length) return;
    updateCategoryByKey(targetKey, (c) => {
      const updatedFixtures = (c.fixtures || []).map((f) => {
        if (fixtureDateMap[f.id]) {
          return { ...f, date: fixtureDateMap[f.id], is_rescheduled: true };
        }
        return f;
      });

      const updatedGroupFixtures = syncCupGroupFixtures(c, updatedFixtures);
      const updatedRounds = c.rounds
        ? (c.rounds || []).map((r) =>
            Array.isArray(r)
              ? r.map((t) => {
                  if (t && fixtureDateMap[t.id]) {
                    const newD = fixtureDateMap[t.id];
                    return {
                      ...t,
                      date: newD,
                      is_rescheduled: true,
                      match: { ...(t.match || {}), date: newD, is_rescheduled: true },
                    };
                  }
                  return t;
                })
              : r
          )
        : undefined;

      return {
        ...c,
        fixtures: updatedFixtures,
        ...(updatedGroupFixtures ? { groupFixtures: updatedGroupFixtures } : {}),
        ...(updatedRounds ? { rounds: updatedRounds } : {}),
      };
    });
  };

  const generateRoundRobinPairs = (teamIds, format = 'double') => {
    const cleanIds = (teamIds || []).filter(Boolean);
    if (cleanIds.length < 2) return [];
    const list = [...cleanIds];
    if (list.length % 2 !== 0) {
      list.push('__BYE__');
    }
    const n = list.length;
    const totalRounds = n - 1;
    const half = n / 2;
    const firstLegRounds = [];
    const rotating = [...list];

    for (let r = 0; r < totalRounds; r++) {
      const roundPairs = [];
      for (let i = 0; i < half; i++) {
        const t1 = rotating[i];
        const t2 = rotating[n - 1 - i];
        if (t1 !== '__BYE__' && t2 !== '__BYE__') {
          const home = (r + i) % 2 === 0 ? t1 : t2;
          const away = home === t1 ? t2 : t1;
          roundPairs.push({ round: r + 1, home, away });
        }
      }
      firstLegRounds.push(roundPairs);
      // Rotate all except index 0
      const last = rotating.pop();
      rotating.splice(1, 0, last);
    }

    const allRounds = [...firstLegRounds];
    if (format !== 'single') {
      firstLegRounds.forEach((rPairs, idx) => {
        allRounds.push(
          rPairs.map((p) => ({
            round: totalRounds + idx + 1,
            home: p.away,
            away: p.home,
          }))
        );
      });
    }
    return allRounds;
  };

  const generateLeagueFixturesForTeams = (teams, format = 'double', schedule = {}, referees = []) => {
    const teamIds = (teams || []).map((t) => t.id);
    const roundsList = generateRoundRobinPairs(teamIds, format);
    const totalMatches = roundsList.reduce((acc, r) => acc + r.length, 0);
    const scheduledDates = computeScheduleSlots(totalMatches, schedule);

    const fixtures = [];
    let seq = 1;
    let slotIdx = 0;

    roundsList.forEach((rPairs) => {
      rPairs.forEach((pair) => {
        const ref = pickRandomReferee(referees);
        const dateStr = scheduledDates[slotIdx] || 'Sat, 18 Apr · 15:00';
        slotIdx++;
        fixtures.push({
          id: `F${seq}`,
          round: pair.round,
          date: dateStr,
          home: pair.home,
          away: pair.away,
          played: false,
          walkover: null,
          referee: ref,
          events: [],
        });
        seq++;
      });
    });
    return fixtures;
  };

  const generateCupStructureForTeams = (teams, schedule = {}, referees = []) => {
    const teamList = teams || [];
    const numGroups = teamList.length >= 12 ? 4 : teamList.length >= 3 ? 2 : 1;
    const allLetters = ['A', 'B', 'C', 'D'];
    const groupLetters = allLetters.slice(0, numGroups);
    const groupOf = {};
    const groupsMap = {};
    groupLetters.forEach((l) => {
      groupsMap[l] = [];
    });

    teamList.forEach((t, idx) => {
      const gLetter = groupLetters[idx % groupLetters.length];
      groupOf[t.id] = gLetter;
      groupsMap[gLetter].push(t.id);
    });

    // Count total group fixtures
    let totalGroupMatches = 0;
    const groupPairsByLetter = {};
    groupLetters.forEach((letter) => {
      const gTeamIds = groupsMap[letter];
      const gRounds = generateRoundRobinPairs(gTeamIds, 'single');
      groupPairsByLetter[letter] = gRounds;
      totalGroupMatches += gRounds.reduce((acc, r) => acc + r.length, 0);
    });

    const groupScheduledDates = computeScheduleSlots(totalGroupMatches, schedule);
    const groupFixtures = {};
    const flatFixtures = [];
    let slotIdx = 0;

    groupLetters.forEach((letter) => {
      const gRounds = groupPairsByLetter[letter];
      const gFixList = [];
      let gSeq = 1;
      gRounds.forEach((rPairs) => {
        rPairs.forEach((pair) => {
          const ref = pickRandomReferee(referees);
          const dateStr = groupScheduledDates[slotIdx] || 'Sat, 18 Apr · 15:00';
          slotIdx++;
          const fObj = {
            id: `GF-${letter}-${gSeq}`,
            round: pair.round,
            group: letter,
            date: dateStr,
            home: pair.home,
            away: pair.away,
            played: false,
            walkover: null,
            referee: ref,
            events: [],
          };
          gFixList.push(fObj);
          flatFixtures.push(fObj);
          gSeq++;
        });
      });
      groupFixtures[letter] = gFixList;
    });

    // Generate Knockout Progression Bracket with scheduling slots
    const totalKoTies = teamList.length >= 6 ? 7 : teamList.length >= 3 ? 3 : 1;
    const koScheduledDates = computeScheduleSlots(totalKoTies + totalGroupMatches, schedule).slice(totalGroupMatches);
    let koSlotIdx = 0;

    const makeKoTie = (id, stage, home, away) => {
      const ref = pickRandomReferee(referees);
      const date = koScheduledDates[koSlotIdx] || 'Sat, 02 May · 15:00';
      koSlotIdx++;
      return {
        id,
        stage,
        date,
        home,
        away,
        referee: ref,
        match: { played: false, events: [], referee: ref },
        pen: { h: '', a: '' },
      };
    };

    const rounds = [];
    if (teamList.length >= 6) {
      const qfTies = Array.from({ length: 4 }, (_, i) =>
        makeKoTie(
          `CUP-R1-T${i + 1}`,
          'Quarter-Finals',
          teamList[i * 2]?.id || null,
          teamList[i * 2 + 1]?.id || null
        )
      );
      const sfTies = Array.from({ length: 2 }, (_, i) =>
        makeKoTie(`CUP-R2-T${i + 1}`, 'Semi-Finals', null, null)
      );
      const finalTie = [
        makeKoTie('CUP-R3-T1', 'Grand Final', null, null),
      ];
      rounds.push(qfTies, sfTies, finalTie);
    } else if (teamList.length >= 3) {
      const sfTies = Array.from({ length: 2 }, (_, i) =>
        makeKoTie(
          `CUP-R1-T${i + 1}`,
          'Semi-Finals',
          teamList[i * 2]?.id || null,
          teamList[i * 2 + 1]?.id || null
        )
      );
      const finalTie = [
        makeKoTie('CUP-R2-T1', 'Grand Final', null, null),
      ];
      rounds.push(sfTies, finalTie);
    } else {
      rounds.push([
        makeKoTie(
          'CUP-R1-T1',
          'Grand Final',
          teamList[0]?.id || null,
          teamList[1]?.id || null
        ),
      ]);
    }

    return {
      groupLetters,
      groupOf,
      groupFixtures,
      fixtures: flatFixtures,
      rounds,
    };
  };

  const buildTournamentTeamsFromBalanced = (balancedTeams, existingTeams = []) => {
    const usedCodes = new Set(existingTeams.map((t) => t.id));
    const TACTICAL_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'LW', 'RW', 'ST'];
    const CORE_CLUBS = [
      { id: 'MAN', name: 'Mancheli', color: '#C9A227' },
      { id: 'SS', name: 'Super Strikers', color: '#B23A2E' },
      { id: 'RAN', name: 'Rangers', color: '#3F7A4E' },
      { id: 'MAS', name: 'Masters', color: '#D97B29' },
      { id: 'OXF', name: 'Oxford', color: '#2E5A8F' },
    ];

    return balancedTeams.map((bTeam, idx) => {
      const defaultClub = idx < CORE_CLUBS.length ? CORE_CLUBS[idx] : null;
      const cleanName = (bTeam.name || defaultClub?.name || `Team ${idx + 1}`).trim();
      let baseCode =
        defaultClub && !usedCodes.has(defaultClub.id)
          ? defaultClub.id
          : cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || `T${idx + 1}`;
      let code = baseCode;
      let suffix = 2;
      while (usedCodes.has(code)) {
        code = `${baseCode.slice(0, 2)}${suffix}`;
        suffix++;
      }
      usedCodes.add(code);

      const rawSquad = bTeam.players || [];
      const distinctPositions = new Set(rawSquad.map((p) => p.position || 'CM'));
      const needsPositionSpread = rawSquad.length > 1 && distinctPositions.size === 1 && distinctPositions.has('CM');

      const teamPlayers = [
        { id: `${code}-UNK`, name: 'Unrecorded scorer', unknown: true },
        ...rawSquad.map((p, pIdx) => {
          const permId = `${code}-P${pIdx + 1}`;
          const defaultUname =
            String(p.name || '')
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_|_$/g, '') || permId.toLowerCase();
          const assignedPosition = needsPositionSpread
            ? TACTICAL_POSITIONS[pIdx % TACTICAL_POSITIONS.length]
            : p.position || 'CM';
          return {
            id: permId,
            permanentId: permId,
            name: p.name,
            username: defaultUname,
            password: 'titans2026',
            position: assignedPosition,
            playerClass: p.player_class || 'C',
          };
        }),
      ];

      return {
        id: code,
        name: cleanName,
        color: bTeam.color || defaultClub?.color || PALETTE[(existingTeams.length + idx) % PALETTE.length],
        players: teamPlayers,
      };
    });
  };

  const handleGenerateFixtures = (targetKey = activeCategoryKey) => {
    const targetCat = data?.categories?.[targetKey];
    if (!targetCat) return;
    const teams = targetCat.teams || [];
    if (teams.length < 2) {
      alert('Add at least 2 teams to generate fixtures for this competition.');
      return;
    }
    updateCategoryByKey(targetKey, (c) => {
      if (c.mode === 'cup') {
        const cupStruct = generateCupStructureForTeams(c.teams, c.schedule, c.referees);
        return {
          ...c,
          ...cupStruct,
        };
      }
      const fixtures = generateLeagueFixturesForTeams(c.teams, c.format || 'double', c.schedule, c.referees);
      return {
        ...c,
        fixtures,
      };
    });
  };

  const handleApplyBalancedTeamsToCategory = (
    balancedTeams,
    targetKey = activeCategoryKey,
    replaceExisting = true,
    incomingReferees = []
  ) => {
    const currentCat = data.categories[targetKey] || cat;
    const baseTeams = replaceExisting ? [] : currentCat?.teams || [];
    const createdTeams = buildTournamentTeamsFromBalanced(balancedTeams, baseTeams);
    const finalTeams = [...baseTeams, ...createdTeams];
    const schedule = currentCat?.schedule || { time: '15:00', days: { 6: 1, 0: 1 } };
    const existingRefs = currentCat?.referees || [];
    const mergedRefs = [...existingRefs];
    (incomingReferees || []).forEach((r) => {
      if (r && !mergedRefs.includes(r)) mergedRefs.push(r);
    });

    let updatedCat;
    let fixtureCount = 0;

    if (currentCat?.mode === 'cup') {
      const cupStruct = generateCupStructureForTeams(finalTeams, schedule, mergedRefs);
      fixtureCount = cupStruct.fixtures.length;
      updatedCat = {
        ...currentCat,
        teams: finalTeams,
        referees: mergedRefs,
        ...cupStruct,
        votingConfig: currentCat.votingConfig || {
          team_size: Math.min(11, Math.max(5, balancedTeams[0]?.players?.length || 6)),
          max_picks_per_position: 2,
          include_gk: true,
        },
      };
    } else {
      const fixtures = generateLeagueFixturesForTeams(
        finalTeams,
        currentCat?.format || 'double',
        schedule,
        mergedRefs
      );
      fixtureCount = fixtures.length;
      updatedCat = {
        ...currentCat,
        teams: finalTeams,
        referees: mergedRefs,
        fixtures,
        votingConfig: currentCat?.votingConfig || {
          team_size: Math.min(11, Math.max(5, balancedTeams[0]?.players?.length || 6)),
          max_picks_per_position: 2,
          include_gk: true,
        },
      };
    }

    const nextCategories = { ...data.categories, [targetKey]: updatedCat };
    commitData({ ...data, categories: nextCategories, activeCategory: targetKey });
    return { key: targetKey, fixtureCount, teamCount: finalTeams.length };
  };

  const handleCreateCategoryWithBalancedTeams = (
    categoryTitle,
    balancedTeams,
    mode = 'league',
    format = 'double',
    incomingReferees = []
  ) => {
    const cleanTitle = (categoryTitle || 'Balanced Championship').trim();
    const baseSlug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'balanced';
    let slug = baseSlug;
    let counter = 2;
    while (data.categories[slug] || data.deletedCategories?.[slug]) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    const createdTeams = buildTournamentTeamsFromBalanced(balancedTeams, []);
    const schedule = { time: '15:00', days: { 6: 1, 0: 1 } };
    const defaultTeamSize = Math.min(11, Math.max(5, balancedTeams[0]?.players?.length || 6));
    const referees = (incomingReferees || []).filter(Boolean);

    let newCat;
    let fixtureCount = 0;

    if (mode === 'cup') {
      const cupStruct = generateCupStructureForTeams(createdTeams, schedule, referees);
      fixtureCount = cupStruct.fixtures.length;
      newCat = {
        label: cleanTitle,
        mode: 'cup',
        format: 'knockout',
        teams: createdTeams,
        ...cupStruct,
        schedule,
        referees,
        votingConfig: { team_size: defaultTeamSize, max_picks_per_position: 2, include_gk: true },
      };
    } else {
      const fixtures = generateLeagueFixturesForTeams(createdTeams, format, schedule, referees);
      fixtureCount = fixtures.length;
      newCat = {
        label: cleanTitle,
        mode: 'league',
        format: format || 'double',
        teams: createdTeams,
        fixtures,
        schedule,
        referees,
        votingConfig: { team_size: defaultTeamSize, max_picks_per_position: 2, include_gk: true },
      };
    }

    const nextCategories = { ...data.categories, [slug]: newCat };
    commitData({ ...data, categories: nextCategories, activeCategory: slug });
    return { key: slug, fixtureCount, teamCount: createdTeams.length };
  };

  const handleNavigateToCompetitionView = (viewName, targetCategoryKey) => {
    if (targetCategoryKey && data.categories[targetCategoryKey] && data.activeCategory !== targetCategoryKey) {
      handleSelectActiveCategory(targetCategoryKey);
    }
    if (viewName === 'fixtures') {
      setFixturesInitialFilter('all');
    }
    setCurrentView(viewName);
  };

  const handleDeleteCategory = (catKey = activeCategoryKey) => {
    const targetCat = data?.categories?.[catKey];
    if (!targetCat) return;
    const nextCategories = { ...data.categories };
    delete nextCategories[catKey];
    const remainingKeys = Object.keys(nextCategories);
    if (remainingKeys.length === 0) {
      alert('Cannot soft-delete the last active competition.');
      return;
    }
    const nextDeleted = {
      ...(data.deletedCategories || {}),
      [catKey]: {
        ...targetCat,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      },
    };
    const nextActive = catKey === activeCategoryKey ? remainingKeys[0] : activeCategoryKey;
    commitData({
      ...data,
      categories: nextCategories,
      deletedCategories: nextDeleted,
      activeCategory: nextActive,
    });
  };

  const handleRestoreCategory = (catKey) => {
    const deletedCat = data?.deletedCategories?.[catKey];
    if (!deletedCat) return;
    const nextDeleted = { ...(data.deletedCategories || {}) };
    delete nextDeleted[catKey];
    const restoredCat = {
      ...deletedCat,
      isDeleted: false,
      deletedAt: null,
    };
    const nextCategories = {
      ...data.categories,
      [catKey]: restoredCat,
    };
    commitData({
      ...data,
      categories: nextCategories,
      deletedCategories: nextDeleted,
      activeCategory: catKey,
    });
  };

  const handlePermanentDeleteCategory = (catKey) => {
    const nextDeleted = { ...(data.deletedCategories || {}) };
    delete nextDeleted[catKey];
    commitData({
      ...data,
      deletedCategories: nextDeleted,
      permanentlyDeletedKeys: [catKey],
    });
  };

  const handleOpenH2H = async (team1Id, team2Id, catKey = activeCategoryKey) => {
    setH2HState({ open: true, loading: true, data: null, error: null });
    try {
      const res = await api.getH2H(catKey, team1Id, team2Id);
      setH2HState({ open: true, loading: false, data: res, error: null });
    } catch (err) {
      setH2HState({ open: true, loading: false, data: null, error: err.message });
    }
  };

  const handleOpenTeamDetails = (teamId, catKey = activeCategoryKey) => {
    setTeamModalState({
      open: true,
      teamId,
      categoryKey: catKey || activeCategoryKey,
    });
  };

  // Auth Callbacks
  const handleCmsLoginSuccess = (cms) => {
    // Single-session mutual exclusivity: log off player if manager signs in
    setPlayerUser(null);
    api.setPlayerToken('');
    setCmsUser(cms);
    setIsCmsMode(true);
    setCurrentView('manage');
  };

  const handlePlayerLoginSuccess = (player) => {
    // Single-session mutual exclusivity: log off manager if player signs in
    setCmsUser(null);
    setIsCmsMode(false);
    api.setCmsToken('');
    setPlayerUser(player);
    setCurrentView('player-dashboard');
  };

  const handleLogoutCms = async () => {
    await api.logout('cms');
    setCmsUser(null);
    setIsCmsMode(false);
    if (currentView === 'manage') setCurrentView('home');
  };

  const handleLogoutPlayer = async () => {
    await api.logout('player');
    setPlayerUser(null);
    if (currentView === 'player-dashboard') setCurrentView('home');
  };

  if (!data || !cat) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B3A2E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#8FA89B' }}>
          <img src={(typeof window !== 'undefined' && window.CLUB_LOGO_URL) || '/club-logo.jpg'} alt="Ruiru Titans" style={{ width: '64px', height: '64px', marginBottom: '16px', objectFit: 'contain' }} />
          <div style={{ color: '#F4F2EA', fontWeight: 600 }}>Loading Ruiru Titans Official Club Homepage…</div>
        </div>
      </div>
    );
  }

  const navTabs = [
    { key: 'home', label: '🏠 Home' },
    { key: 'championship', label: '🏆 Championship' },
    { key: 'table', label: '📊 League Table' },
    { key: 'fixtures', label: '⚽ Results & Fixtures' },
    { key: 'cup', label: '🏆 Cup Progression' },
    { key: 'highlights', label: '🎥 Highlights' },
    { key: 'archives', label: '🏛️ Archives' },
    { key: 'voting', label: '⭐ TOTW & TOTT (Vote)' },
    { key: 'stats', label: '📈 Player Stats' },
    { key: 'balancer', label: '⚖️ Team Balancer' },
    ...(playerUser
      ? [{ key: 'player-dashboard', label: '👤 Player Dashboard' }]
      : isCmsMode && cmsUser
      ? [
          { key: 'manage', label: '🛠️ Manager Dashboard' },
          { key: 'register-players', label: '📝 Register Players' },
        ]
      : [
          { key: 'manage', label: '🔐 Manager Dashboard' },
        ]),
  ];

  // League Leaders: only shown when an active competition exists and has >0 pts, displaying all teams tied at level points
  const leagueLeaders = useMemo(() => {
    const currentActiveCat = data?.categories?.[activeCategoryKey];
    if (!currentActiveCat || currentActiveCat.isDeleted) return null;
    const targetLeagueCat = currentActiveCat.mode === 'league' ? currentActiveCat : leagueCat;
    if (!targetLeagueCat || targetLeagueCat.isDeleted) return null;
    if (!targetLeagueCat.teams || targetLeagueCat.teams.length === 0) return null;
    if (!standingsTable || standingsTable.length === 0) return null;

    const maxPts = Math.max(...standingsTable.map((t) => Number(t.Pts) || 0));
    if (maxPts <= 0) return null;

    const tiedLeaders = standingsTable.filter((t) => (Number(t.Pts) || 0) === maxPts);
    if (tiedLeaders.length === 0) return null;

    const formattedNames =
      tiedLeaders.length === 1
        ? tiedLeaders[0].name
        : tiedLeaders.length === 2
        ? `${tiedLeaders[0].name} & ${tiedLeaders[1].name}`
        : `${tiedLeaders.slice(0, -1).map((t) => t.name).join(', ')} & ${tiedLeaders[tiedLeaders.length - 1].name}`;

    return {
      teams: tiedLeaders,
      pts: maxPts,
      names: formattedNames,
    };
  }, [data?.categories, activeCategoryKey, leagueCat, standingsTable]);

  return (
    <div style={{ minHeight: '100vh', background: '#08261E', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar with Sign In to Manager Dashboard Link & Player Auth */}
      <TopNav
        syncStatus={syncStatus}
        cmsUser={cmsUser}
        playerUser={playerUser}
        isCmsMode={isCmsMode}
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
        onOpenAuthModal={(tab) => setAuthModal({ open: true, tab })}
        onToggleCmsMode={(nextVal) => {
          const next = typeof nextVal === 'boolean' ? nextVal : !isCmsMode;
          if (!next) {
            handleLogoutCms();
          } else if (cmsUser) {
            setIsCmsMode(true);
            setCurrentView('manage');
          } else {
            setAuthModal({ open: true, tab: 'cms' });
          }
        }}
        onLogoutCms={handleLogoutCms}
        onLogoutPlayer={handleLogoutPlayer}
      />

      {/* Main Content Container */}
      <main style={{ maxWidth: '1180px', width: '100%', margin: '0 auto', padding: '20px 16px 64px', flex: 1 }}>
        {/* STUNNING HERO BANNER */}
        <section
          className="hero-banner"
          style={{
            background: 'radial-gradient(circle at 85% 20%, rgba(201, 162, 39, 0.22) 0%, rgba(15, 46, 36, 0.96) 55%, #091F18 100%)',
            border: '1px solid #2B5746',
            borderRadius: '18px',
            padding: '28px 28px 22px',
            marginBottom: '20px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.35)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
            {/* Club Identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flex: '1 1 460px' }}>
              <div
                style={{
                  width: '84px',
                  height: '84px',
                  borderRadius: '18px',
                  background: '#082018',
                  border: '2px solid #C9A227',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(201, 162, 39, 0.25)',
                  flexShrink: 0,
                }}
              >
                <img
                  src={(typeof window !== 'undefined' && window.CLUB_LOGO_URL) || '/club-logo.jpg'}
                  alt="Ruiru Titans Football Club Crest"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '10px' }}
                />
              </div>

              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      background: 'rgba(201, 162, 39, 0.18)',
                      border: '1px solid rgba(201, 162, 39, 0.45)',
                      color: '#C9A227',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      padding: '2px 10px',
                      borderRadius: '999px',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}
                  >
                    EST. 2026 · RUIRU · OFFICIAL CLUB PORTAL
                  </span>
                  {leagueLeaders && (
                    <span style={{ fontSize: '11.5px', color: '#6CE5A0', fontWeight: 700 }}>
                      🏆 League Leader{leagueLeaders.teams.length > 1 ? 's' : ''}: {leagueLeaders.names} ({leagueLeaders.pts} pts)
                    </span>
                  )}
                </div>

                <h1
                  className="scoreboard"
                  style={{
                    color: '#F4F2EA',
                    fontSize: 'clamp(32px, 5vw, 48px)',
                    margin: '2px 0 4px',
                    lineHeight: 0.98,
                    letterSpacing: '0.04em',
                  }}
                >
                  RUIRU TITANS FOOTBALL CLUB
                </h1>

                <p style={{ color: '#9BB5A8', fontSize: '13px', margin: 0, maxWidth: '580px', lineHeight: 1.5 }}>
                  Official home of the Ruiru Titans League Table, Live Match Results, Upcoming Fixtures, Knockout Cup Progression Levels, and Public TOTW &amp; TOTT Honours.
                </p>
              </div>
            </div>

            {/* Hero Action CTAs: Manager Dashboard Sign-In & Player Voting Sign-In */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '240px' }}>
              {!playerUser && (
                <>
                  {cmsUser && isCmsMode ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentView('manage');
                        }}
                        style={{
                          background: '#C9A227',
                          color: '#16201B',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '11px 18px',
                          fontSize: '13px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 16px rgba(201, 162, 39, 0.3)',
                        }}
                      >
                        🛠️ Open Manager Dashboard
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setManageSection('players');
                          setCurrentView('manage');
                        }}
                        style={{
                          background: 'rgba(201, 162, 39, 0.16)',
                          border: '1px solid #C9A227',
                          color: '#F4F2EA',
                          borderRadius: '10px',
                          padding: '10px 16px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        📝 Register New Player (4-Digit Code)
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAuthModal({ open: true, tab: 'cms' })}
                      style={{
                        background: '#C9A227',
                        color: '#16201B',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '11px 18px',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 16px rgba(201, 162, 39, 0.3)',
                      }}
                    >
                      🔐 Open Manager Dashboard
                    </button>
                  )}
                </>
              )}

              {playerUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentView('player-dashboard')}
                    style={{
                      background: currentView === 'player-dashboard' ? '#C9A227' : '#16352A',
                      color: currentView === 'player-dashboard' ? '#16201B' : '#6CE5A0',
                      border: '1px solid #3F7A4E',
                      borderRadius: '10px',
                      padding: '10px 16px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    👤 Player Dashboard ({playerUser.name})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVotingInitialTab('ballot');
                      setCurrentView('voting');
                    }}
                    style={{
                      background: 'rgba(201, 162, 39, 0.15)',
                      color: '#C9A227',
                      border: '1px solid #C9A227',
                      borderRadius: '10px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    🗳️ Cast Player Vote
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthModal({ open: true, tab: 'player' })}
                  style={{
                    background: '#16352A',
                    color: '#F4F2EA',
                    border: '1px solid #2B5746',
                    borderRadius: '10px',
                    padding: '10px 16px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  ⚽ Player Sign In (Dashboard &amp; Voting)
                </button>
              )}
            </div>
          </div>

          {/* Quick Stats Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '10px',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(43, 87, 70, 0.6)',
            }}
          >
            {[
              { label: 'League Clubs', value: clubMetrics.teamsCount, sub: 'Double Round-Robin', icon: '🛡️' },
              { label: 'Match Results', value: clubMetrics.completedCount, sub: 'Official Final Scores', icon: '✅' },
              { label: 'Upcoming Fixtures', value: clubMetrics.upcomingCount, sub: 'Scheduled Matchdays', icon: '📅' },
              { label: 'Goals Scored', value: clubMetrics.totalGoals, sub: '2026 Season Tally', icon: '⚽' },
              { label: 'Cup Progression', value: 'QF → SF → Final', sub: '2 Groups + 3 Knockout Levels', icon: '🏆' },
            ].map((stat, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(10, 36, 28, 0.75)',
                  border: '1px solid #1E4636',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '20px' }}>{stat.icon}</span>
                <div>
                  <div style={{ fontSize: '10.5px', color: '#8FA89B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {stat.label}
                  </div>
                  <div className="scoreboard" style={{ fontSize: '21px', color: '#F4F2EA', lineHeight: 1.1 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: '10px', color: '#6E9080' }}>{stat.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Manager Dashboard Active Banner */}
        {isCmsMode && (
          <div
            style={{
              background: 'rgba(201, 162, 39, 0.14)',
              border: '1px solid #C9A227',
              borderRadius: '12px',
              padding: '12px 18px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>🛠️</span>
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Manager Dashboard Active ({cmsUser?.username || 'Manager'})
                </div>
                <div style={{ fontSize: '11.5px', color: '#DDE6DF' }}>
                  You can now edit match events, mark fixtures final, assign referees, manage teams/players, and control voting windows across all categories.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(data.categories).map(([k, c]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleSelectActiveCategory(k)}
                  style={{
                    background: k === activeCategoryKey ? '#C9A227' : '#16352A',
                    color: k === activeCategoryKey ? '#16201B' : '#DDE6DF',
                    fontWeight: 700,
                    fontSize: '11.5px',
                    padding: '5px 12px',
                    borderRadius: '999px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {c.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAddingCategory(!addingCategory)}
                style={{
                  background: 'transparent',
                  border: '1px dashed #C9A227',
                  color: '#C9A227',
                  fontSize: '11.5px',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                }}
              >
                {addingCategory ? '✕ Cancel' : '+ New Category'}
              </button>
              {Object.keys(data.categories).length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(activeCategoryKey)}
                  title={`Soft-delete "${cat?.label}" (moves to Archive/Trash so you can restore anytime)`}
                  style={{
                    background: 'rgba(226, 74, 59, 0.18)',
                    border: '1px solid #E24A3B',
                    color: '#FF9990',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    cursor: 'pointer',
                  }}
                >
                  🗑️ Soft Delete &ldquo;{cat?.label}&rdquo;
                </button>
              )}
              {Object.keys(data.deletedCategories || {}).length > 0 && (
                <select
                  className="form-input"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleRestoreCategory(e.target.value);
                  }}
                  style={{
                    width: 'auto',
                    fontSize: '11px',
                    padding: '3px 10px',
                    height: '28px',
                    borderColor: '#2E8B57',
                    color: '#6CE5A0',
                    fontWeight: 800,
                  }}
                >
                  <option value="">
                    ♻️ Restore Soft-Deleted ({Object.keys(data.deletedCategories).length})…
                  </option>
                  {Object.entries(data.deletedCategories).map(([delKey, delCat]) => (
                    <option key={delKey} value={delKey}>
                      Restore: {delCat.label || delKey}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* Add Category Form (CMS only) */}
        {isCmsMode && addingCategory && (
          <form
            onSubmit={handleCreateCategory}
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '16px',
              background: '#0F2E24',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid #2B5746',
              flexWrap: 'wrap',
            }}
          >
            <input
              className="form-input"
              style={{ flex: '1 1 200px', minWidth: '200px' }}
              placeholder="Category name (e.g. Under 20s, Super Cup 2026)…"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
            <select
              className="form-input"
              style={{ width: '160px' }}
              value={newCatMode}
              onChange={(e) => setNewCatMode(e.target.value)}
            >
              <option value="league">League Format</option>
              <option value="cup">Cup Knockout Format</option>
            </select>
            <input
              className="form-input"
              style={{ flex: '1 1 240px', minWidth: '220px' }}
              placeholder="Referees (comma-separated: Ref Kamau, Ref Otieno)…"
              value={newCatRefs}
              onChange={(e) => setNewCatRefs(e.target.value)}
            />
            <button type="submit" className="stat-btn" style={{ background: '#C9A227', color: '#16201B', fontWeight: 800, padding: '8px 18px' }}>
              Create Category
            </button>
          </form>
        )}

        {/* Primary Section Navigation Bar */}
        <nav
          aria-label="Club Homepage Sections"
          style={{
            display: 'flex',
            gap: '6px',
            marginBottom: '14px',
            background: '#0F2E24',
            padding: '6px',
            borderRadius: '12px',
            border: '1px solid #1E4636',
            overflowX: 'auto',
          }}
        >
          {navTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className="tab-btn"
              onClick={() => {
                if (t.key === 'register-players') {
                  setManageSection('players');
                  if (cmsUser && isCmsMode) {
                    setCurrentView('manage');
                  } else {
                    setCurrentView('manage');
                    setAuthModal({ open: true, tab: 'cms' });
                  }
                  return;
                }
                if (t.key === 'manage') {
                  setManageSection('players');
                  if (!cmsUser || !isCmsMode) {
                    setAuthModal({ open: true, tab: 'cms' });
                  }
                  setCurrentView('manage');
                  return;
                }
                if (t.key === 'table') {
                  if (cat?.mode !== 'league' && data.activeCategory !== leagueCategoryKey) {
                    handleSelectActiveCategory(leagueCategoryKey);
                  }
                } else if (t.key === 'cup') {
                  if (cat?.mode !== 'cup' && data.categories[cupCategoryKey] && data.activeCategory !== cupCategoryKey) {
                    handleSelectActiveCategory(cupCategoryKey);
                  }
                }
                setCurrentView(t.key);
              }}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: currentView === t.key ? '#C9A227' : 'transparent',
                color: currentView === t.key ? '#16201B' : '#9BB5A8',
                fontWeight: 800,
                fontSize: '12.5px',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Public Active Competition Switcher Bar (for Fixtures, Voting, Standings, Cup, Stats & Balancer) */}
        {currentView !== 'home' && Object.keys(data.categories || {}).length > 0 && (
          <div
            style={{
              background: '#0B281F',
              border: '1px solid #1E4636',
              borderRadius: '10px',
              padding: '9px 14px',
              marginBottom: '18px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#8FA89B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}
              >
                🏆 Active Competition:
              </span>
              {Object.entries(data.categories).map(([k, c]) => {
                const isActive = k === activeCategoryKey;
                const isCup = c.mode === 'cup';
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleSelectActiveCategory(k)}
                    style={{
                      background: isActive ? '#C9A227' : '#13362B',
                      color: isActive ? '#16201B' : '#DDE6DF',
                      border: isActive ? '1px solid #C9A227' : '1px solid #245040',
                      borderRadius: '999px',
                      padding: '5px 12px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>{isCup ? '🏆' : '📊'}</span>
                    <span>{c.label}</span>
                    <span
                      style={{
                        fontSize: '10px',
                        opacity: 0.85,
                        fontWeight: 700,
                      }}
                    >
                      ({(c.teams || []).length} teams)
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '11px', color: '#6CE5A0', fontWeight: 700 }}>
                Viewing: <strong>{cat?.label}</strong> ({cat?.mode === 'cup' ? 'Knockout Cup' : 'League'} · {(cat?.fixtures || []).length} fixtures)
              </div>
              <button
                type="button"
                onClick={() => openCategoryFixturesResultsPDF(activeCategoryKey)}
                style={{
                  background: '#0B3A2E',
                  color: '#F4F2EA',
                  border: '1px solid #2B5746',
                  borderRadius: '999px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                }}
                title={`Download official PDF fixtures & results dossier for ${cat?.label}`}
              >
                📄 Download PDF
              </button>
            </div>
          </div>
        )}

        {/* =========================================================
            1A. CLUB HOMEPAGE (CAROUSEL, U13/U15/U17/WAZAE JERSEYS & SIDEBAR FIXTURES)
           ========================================================= */}
        {currentView === 'home' && (
          <ClubHomeView
            homepageData={data.homepage}
            categoriesData={data.categories}
            isCmsMode={isCmsMode}
            cmsUser={cmsUser}
            onNavigateChampionship={() => setCurrentView('championship')}
            onNavigateHighlights={() => setCurrentView('highlights')}
            onNavigateArchives={() => setCurrentView('archives')}
            onNavigateManageHomepage={() => {
              if (cmsUser) {
                setIsCmsMode(true);
                setCurrentView('manage');
              } else {
                setAuthModal({ open: true, tab: 'cms' });
              }
            }}
            onSelectTeam={handleOpenTeamDetails}
          />
        )}

        {/* =========================================================
            1B. CHAMPIONSHIP PAGE (ALL TOURNAMENT SECTIONS MOVED FROM HOMEPAGE)
           ========================================================= */}
        {currentView === 'championship' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Top 2-Column Grid: League Table + Match Results & Upcoming Fixtures */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
                gap: '22px',
                alignItems: 'start',
              }}
            >
              {/* Left Column: Official League Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className="scoreboard" style={{ margin: 0, fontSize: '24px', color: '#F4F2EA', letterSpacing: '0.04em' }}>
                    📊 RUIRU TITANS LEAGUE TABLE
                  </h2>
                  <button
                    type="button"
                    onClick={() => setCurrentView('table')}
                    className="btn-pill-action"
                  >
                    Full Standings →
                  </button>
                </div>
                <TableView
                  table={standingsTable}
                  teamCount={leagueCat?.teams?.length || 0}
                  activeCategoryKey={leagueCategoryKey}
                  onSelectTeam={handleOpenTeamDetails}
                />
              </div>

              {/* Right Column: Latest Match Results & Upcoming Fixtures */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Latest Match Results Card */}
                <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '14px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#4ADE80', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        ✅ Latest Match Results
                      </span>
                      <div style={{ fontSize: '11px', color: '#8FA89B' }}>
                        Completed Ruiru Titans League matches
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-pill-action"
                      onClick={() => {
                        setFixturesInitialFilter('results');
                        setCurrentView('fixtures');
                      }}
                    >
                      All {clubMetrics.completedCount} Results →
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {clubMetrics.recentResults.map((f) => {
                      const home = leagueTeamsById[f.home];
                      const away = leagueTeamsById[f.away];
                      const { hs, as } = computeFixtureScore(f);
                      return (
                        <div
                          key={f.id}
                          style={{
                            background: '#0A241C',
                            border: '1px solid #163E31',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}
                        >
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: home?.color || '#C9A227' }} />
                            {f.home ? (
                              <button
                                type="button"
                                className="team-link-btn"
                                onClick={() => handleOpenTeamDetails(f.home, leagueCategoryKey)}
                                style={{ fontWeight: 700, fontSize: '13px', color: '#F4F2EA' }}
                                title={`Click to view ${home?.name || f.home} profile & odds`}
                              >
                                {home?.name || f.home}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#F4F2EA' }}>{home?.name || f.home}</span>
                            )}
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <span
                              className="scoreboard"
                              style={{
                                fontSize: '20px',
                                color: '#C9A227',
                                background: '#0F2E24',
                                padding: '2px 10px',
                                borderRadius: '6px',
                                border: '1px solid #1E4636',
                              }}
                            >
                              {hs} - {as}
                            </span>
                            <div style={{ fontSize: '9.5px', color: '#6E9080', marginTop: '2px' }}>{f.date}</div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', textAlign: 'right' }}>
                            {f.away ? (
                              <button
                                type="button"
                                className="team-link-btn"
                                onClick={() => handleOpenTeamDetails(f.away, leagueCategoryKey)}
                                style={{ fontWeight: 700, fontSize: '13px', color: '#F4F2EA' }}
                                title={`Click to view ${away?.name || f.away} profile & odds`}
                              >
                                {away?.name || f.away}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#F4F2EA' }}>{away?.name || f.away}</span>
                            )}
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: away?.color || '#2E5A8F' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Upcoming Fixtures Card */}
                <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '14px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#C9A227', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        📅 Upcoming League Fixtures
                      </span>
                      <div style={{ fontSize: '11px', color: '#8FA89B' }}>
                        Next scheduled matchdays at Ruiru Grounds
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-pill-action"
                      onClick={() => {
                        setFixturesInitialFilter('upcoming');
                        setCurrentView('fixtures');
                      }}
                    >
                      All {clubMetrics.upcomingCount} Upcoming →
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {clubMetrics.nextFixtures.map((f) => {
                      const home = leagueTeamsById[f.home];
                      const away = leagueTeamsById[f.away];
                      return (
                        <div
                          key={f.id}
                          style={{
                            background: '#0A241C',
                            border: '1px dashed #2B5746',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}
                        >
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: home?.color || '#C9A227' }} />
                            {f.home ? (
                              <button
                                type="button"
                                className="team-link-btn"
                                onClick={() => handleOpenTeamDetails(f.home, leagueCategoryKey)}
                                style={{ fontWeight: 700, fontSize: '13px', color: '#F4F2EA' }}
                                title={`Click to view ${home?.name || f.home} profile & odds`}
                              >
                                {home?.name || f.home}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#F4F2EA' }}>{home?.name || f.home}</span>
                            )}
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <span
                              className="scoreboard"
                              style={{
                                fontSize: '16px',
                                color: '#8FA89B',
                                background: '#0F2E24',
                                padding: '2px 10px',
                                borderRadius: '6px',
                                border: '1px solid #1E4636',
                              }}
                            >
                              VS
                            </span>
                            <div style={{ fontSize: '9.5px', color: '#C9A227', marginTop: '2px', fontWeight: 600 }}>{f.date}</div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', textAlign: 'right' }}>
                            {f.away ? (
                              <button
                                type="button"
                                className="team-link-btn"
                                onClick={() => handleOpenTeamDetails(f.away, leagueCategoryKey)}
                                style={{ fontWeight: 700, fontSize: '13px', color: '#F4F2EA' }}
                                title={`Click to view ${away?.name || f.away} profile & odds`}
                              >
                                {away?.name || f.away}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#F4F2EA' }}>{away?.name || f.away}</span>
                            )}
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: away?.color || '#2E5A8F' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Cup Progression Levels & Respective Fixtures */}
            {cupCat && (
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <h2 className="scoreboard" style={{ margin: 0, fontSize: '26px', color: '#F4F2EA', letterSpacing: '0.04em' }}>
                    🏆 CUP PROGRESSION LEVELS &amp; RESPECTIVE FIXTURES
                  </h2>
                  <button
                    type="button"
                    className="btn-pill-action"
                    onClick={() => setCurrentView('cup')}
                  >
                    Open Dedicated Cup View →
                  </button>
                </div>
                <CupProgressionView
                  cupCategory={cupCat}
                  cupCategoryKey={cupCategoryKey}
                  cupCategoriesList={Object.entries(data.categories)
                    .filter(([, c]) => c.mode === 'cup')
                    .map(([k, c]) => ({ key: k, label: c.label }))}
                  onSelectCupCategory={(k) => handleSelectActiveCategory(k)}
                  isCmsMode={isCmsMode}
                  onUpdateCupCategory={(mutator) => updateCategoryByKey(cupCategoryKey, mutator)}
                  onOpenH2H={(t1, t2) => handleOpenH2H(t1, t2, cupCategoryKey)}
                  onSelectTeam={handleOpenTeamDetails}
                />
              </section>
            )}

            {/* Section 3: Public TOTW & TOTT Honours + Logged-In Player Voting */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <h2 className="scoreboard" style={{ margin: 0, fontSize: '26px', color: '#F4F2EA', letterSpacing: '0.04em' }}>
                  ⭐ PUBLIC TEAM OF THE WEEK (TOTW) &amp; TEAM OF THE TOURNAMENT (TOTT)
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-pill-action"
                    onClick={() => {
                      setVotingInitialTab('tott');
                      setCurrentView('voting');
                    }}
                  >
                    👑 View TOTT Honours
                  </button>
                  <button
                    type="button"
                    className="btn-pill-action"
                    style={{ background: '#C9A227', color: '#16201B', borderColor: '#C9A227', fontWeight: 800 }}
                    onClick={() => {
                      if (!playerUser) {
                        setAuthModal({ open: true, tab: 'player' });
                      } else {
                        setVotingInitialTab('ballot');
                        setCurrentView('voting');
                      }
                    }}
                  >
                    🗳️ {playerUser ? `Vote Now (${playerUser.name})` : 'Player Sign In to Vote'}
                  </button>
                </div>
              </div>
              <VotingView
                activeCategoryKey={activeCategoryKey}
                categories={data.categories}
                onSelectCategory={(k) => handleSelectActiveCategory(k)}
                playerUser={playerUser}
                cmsUser={cmsUser}
                isCmsMode={isCmsMode}
                initialSubTab={votingInitialTab}
                onRequestPlayerLogin={() => setAuthModal({ open: true, tab: 'player' })}
              />
            </section>
          </div>
        )}

        {/* =========================================================
            2. DEDICATED LEAGUE TABLE VIEW
           ========================================================= */}
        {currentView === 'table' && (
          <TableView
            table={standingsTable}
            teamCount={leagueCat?.teams?.length || 0}
            activeCategoryKey={leagueCategoryKey}
            onSelectTeam={handleOpenTeamDetails}
          />
        )}

        {/* =========================================================
            3. DEDICATED MATCH RESULTS & FIXTURES VIEW
           ========================================================= */}
        {currentView === 'fixtures' && (
          <FixturesView
            fixtures={cat.fixtures}
            teamsById={teamsById}
            suspensions={suspensions}
            referees={cat.referees}
            schedule={cat?.schedule}
            activeCategoryKey={activeCategoryKey}
            categoryLabel={cat?.label}
            isCmsMode={isCmsMode}
            initialFilter={fixturesInitialFilter}
            onTogglePlayed={(fId) => handleTogglePlayed(fId, activeCategoryKey)}
            onAddEvent={(fId, ev) => handleAddEvent(fId, ev, activeCategoryKey)}
            onRemoveEvent={(fId, idx) => handleRemoveEvent(fId, idx, activeCategoryKey)}
            onSetWalkover={(fId, wId) => handleSetWalkover(fId, wId, activeCategoryKey)}
            onSetReferee={(fId, ref) => handleSetReferee(fId, ref, activeCategoryKey)}
            onAddReferee={(refName) => handleAddReferee(refName, activeCategoryKey)}
            onRemoveReferee={(refName) => handleRemoveReferee(refName, activeCategoryKey)}
            onRandomizeReferees={() => handleRandomizeReferees(activeCategoryKey)}
            onUpdateSchedule={(s, apply) => handleUpdateSchedule(activeCategoryKey, s, apply)}
            onMoveFixture={(fId, newDateStr) => handleMoveFixtureDate(activeCategoryKey, fId, newDateStr)}
            onBatchMoveFixtures={(map) => handleBatchMoveFixtures(activeCategoryKey, map)}
            onOpenH2H={(t1, t2) => handleOpenH2H(t1, t2, activeCategoryKey)}
            onGenerateFixtures={handleGenerateFixtures}
            onSelectTeam={handleOpenTeamDetails}
          />
        )}

        {/* =========================================================
            4. DEDICATED CUP PROGRESSION LEVELS & FIXTURES VIEW
           ========================================================= */}
        {currentView === 'cup' && (
          <CupProgressionView
            cupCategory={cupCat || cat}
            cupCategoryKey={cupCat ? cupCategoryKey : activeCategoryKey}
            cupCategoriesList={Object.entries(data.categories)
              .filter(([, c]) => c.mode === 'cup')
              .map(([k, c]) => ({ key: k, label: c.label }))}
            onSelectCupCategory={(k) => handleSelectActiveCategory(k)}
            isCmsMode={isCmsMode}
            suspensions={cupSuspensions}
            schedule={(cupCat || cat)?.schedule}
            onUpdateSchedule={(s, apply) => handleUpdateSchedule(cupCat ? cupCategoryKey : activeCategoryKey, s, apply)}
            onMoveFixture={(fId, newDateStr) => handleMoveFixtureDate(cupCat ? cupCategoryKey : activeCategoryKey, fId, newDateStr)}
            onBatchMoveFixtures={(map) => handleBatchMoveFixtures(cupCat ? cupCategoryKey : activeCategoryKey, map)}
            onUpdateCupCategory={(mutator) => updateCategoryByKey(cupCat ? cupCategoryKey : activeCategoryKey, mutator)}
            onOpenH2H={(t1, t2) => handleOpenH2H(t1, t2, cupCat ? cupCategoryKey : activeCategoryKey)}
            onSelectTeam={handleOpenTeamDetails}
          />
        )}

        {/* =========================================================
            5. DEDICATED TOTW, TOTT & PLAYER VOTING VIEW
           ========================================================= */}
        {currentView === 'voting' && (
          <VotingView
            activeCategoryKey={activeCategoryKey}
            categories={data.categories}
            onSelectCategory={(k) => handleSelectActiveCategory(k)}
            playerUser={playerUser}
            cmsUser={cmsUser}
            isCmsMode={isCmsMode}
            initialSubTab={votingInitialTab}
            onRequestPlayerLogin={() => setAuthModal({ open: true, tab: 'player' })}
          />
        )}

        {/* =========================================================
            6. DEDICATED PLAYER STATS VIEW (GROUPED BY CATEGORY CREATED)
           ========================================================= */}
        {currentView === 'stats' && (
          <StatsView
            categories={data.categories}
            leaderboardsByCategory={leaderboardsByCategory}
            leaderboards={leaderboards}
            activeCategoryKey={activeCategoryKey}
          />
        )}

        {/* =========================================================
            6B. TEAM BALANCER VIEW (Excel / CSV / Table / Google Sheet)
           ========================================================= */}
        {currentView === 'balancer' && (
          <TeamBalancerView
            categories={data.categories}
            activeCategoryKey={activeCategoryKey}
            activeCategoryLabel={cat?.label || 'Open League'}
            onApplyBalancedTeamsToCategory={handleApplyBalancedTeamsToCategory}
            onCreateCategoryWithBalancedTeams={handleCreateCategoryWithBalancedTeams}
            onNavigateToCompetitionView={handleNavigateToCompetitionView}
          />
        )}

        {/* =========================================================
            6D. DEDICATED HIGHLIGHTS VIEW
           ========================================================= */}
        {currentView === 'highlights' && (
          <HighlightsView
            categories={data.categories}
            isCmsMode={isCmsMode}
            cmsUser={cmsUser}
            onNavigateHome={() => setCurrentView('home')}
          />
        )}

        {/* =========================================================
            6E. DEDICATED ARCHIVES VIEW (CONCLUDED COMPETITIONS)
           ========================================================= */}
        {currentView === 'archives' && (
          <ArchivesView
            categories={{ ...(data.categories || {}), ...(data.deletedCategories || {}) }}
            isCmsMode={isCmsMode}
            cmsUser={cmsUser}
            onUpdateCategory={updateCategoryByKey}
            onSelectTeam={handleOpenTeamDetails}
          />
        )}

        {/* =========================================================
            6C. DEDICATED PLAYER DASHBOARD VIEW (Requires Player Sign-In)
           ========================================================= */}
        {currentView === 'player-dashboard' && (
          playerUser ? (
            <PlayerDashboardView
              playerUser={playerUser}
              currentCategory={cat}
              onOpenVotingTab={() => {
                setVotingInitialTab('ballot');
                setCurrentView('voting');
              }}
              onOpenTeamModal={(teamId) => handleOpenTeamDetails(teamId, activeCategoryKey)}
              onLogoutPlayer={handleLogoutPlayer}
              onPlayerUpdated={(updated) => setPlayerUser(updated)}
            />
          ) : (
            <div
              style={{
                background: '#0F2E24',
                border: '1px solid #3F7A4E',
                borderRadius: '14px',
                padding: '36px 24px',
                textAlign: 'center',
              }}
            >
              <h3 className="scoreboard" style={{ fontSize: '28px', color: '#F4F2EA', margin: '0 0 8px' }}>
                👤 PLAYER DASHBOARD SIGN-IN REQUIRED
              </h3>
              <p style={{ fontSize: '13px', color: '#8FA89B', maxWidth: '460px', margin: '0 auto 16px' }}>
                Please sign in with your player username and password (or activation code) to view your season statistics, upcoming matchdays, official discipline status, and voting ballot.
              </p>
              <button
                type="button"
                onClick={() => setAuthModal({ open: true, tab: 'player' })}
                style={{
                  background: '#6CE5A0',
                  color: '#08261E',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ⚽ Sign In as Player
              </button>
            </div>
          )
        )}

        {/* =========================================================
            7. MANAGER DASHBOARD PORTAL VIEW (Requires Manager Sign-In)
           ========================================================= */}
        {currentView === 'manage' && (
          playerUser ? (
            <div
              style={{
                background: '#0F2E24',
                border: '1px solid #1E4636',
                borderRadius: '14px',
                padding: '36px 24px',
                textAlign: 'center',
              }}
            >
              <h3 className="scoreboard" style={{ fontSize: '24px', color: '#F4F2EA', margin: '0 0 8px' }}>
                👤 SIGNED IN AS PLAYER ({playerUser.name})
              </h3>
              <p style={{ fontSize: '13px', color: '#8FA89B', maxWidth: '520px', margin: '0 auto 16px' }}>
                Manager Dashboard is reserved for tournament managers and staff. As a signed-in player, you have access to your personalized Player Dashboard, match results, and TOTW/TOTT ballots.
              </p>
              <button
                type="button"
                onClick={() => setCurrentView('player-dashboard')}
                style={{
                  background: '#6CE5A0',
                  color: '#08261E',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ⚽ Open Player Dashboard
              </button>
            </div>
          ) : cmsUser ? (
            <ManageView
              cat={cat}
              categories={data.categories}
              deletedCategories={data.deletedCategories || {}}
              activeCategoryKey={activeCategoryKey}
              cmsUser={cmsUser}
              onUpdateCmsUser={setCmsUser}
              homepageData={data.homepage}
              onUpdateHomepage={handleUpdateHomepage}
              onUpdateVotingConfig={handleUpdateVotingConfig}
              onAddTeam={handleAddTeam}
              onAddPlayers={handleAddPlayers}
              onRemovePlayer={handleRemovePlayer}
              onUpdatePlayerPosition={handleUpdatePlayerPosition}
              onTogglePlayerStatus={handleTogglePlayerStatus}
              onReleasePlayerJersey={handleReleasePlayerJersey}
              onAddReferee={handleAddReferee}
              onRemoveReferee={handleRemoveReferee}
              onRandomizeReferees={handleRandomizeReferees}
              onDeleteCategory={handleDeleteCategory}
              onRestoreCategory={handleRestoreCategory}
              onPermanentDeleteCategory={handlePermanentDeleteCategory}
              onResetRealSeason={handleResetRealSeason}
              onGenerateFixtures={handleGenerateFixtures}
              onApplyBalancedTeamsToCategory={handleApplyBalancedTeamsToCategory}
              onCreateCategoryWithBalancedTeams={handleCreateCategoryWithBalancedTeams}
              onNavigateToCompetitionView={handleNavigateToCompetitionView}
              onSelectTeam={handleOpenTeamDetails}
              initialSection={manageSection}
            />
          ) : (
            <div
              style={{
                background: '#0F2E24',
                border: '1px solid #C9A227',
                borderRadius: '14px',
                padding: '36px 24px',
                textAlign: 'center',
              }}
            >
              <h3 className="scoreboard" style={{ fontSize: '28px', color: '#F4F2EA', margin: '0 0 8px' }}>
                🔐 MANAGER DASHBOARD SIGN-IN REQUIRED
              </h3>
              <p style={{ fontSize: '13px', color: '#8FA89B', maxWidth: '520px', margin: '0 auto 16px' }}>
                Please sign in with your Ruiru Titans manager password (default: <code>admin123</code>) to access the <strong>📝 Player Registration Form</strong> (with 4-digit code generation), reset player passwords by username, and manage teams and tournament fixtures.
              </p>
              <button
                type="button"
                onClick={() => setAuthModal({ open: true, tab: 'cms' })}
                style={{
                  background: '#C9A227',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🔐 Open Manager Sign-In (Password: admin123)
              </button>
            </div>
          )
        )}
      </main>

      {/* Club Footer with Manager Dashboard Sign-In Link */}
      <footer
        style={{
          background: '#061C15',
          borderTop: '1px solid #163E31',
          padding: '24px 20px',
          color: '#8FA89B',
          fontSize: '12px',
        }}
      >
        <div
          style={{
            maxWidth: '1180px',
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src={(typeof window !== 'undefined' && window.CLUB_LOGO_URL) || '/club-logo.jpg'}
              alt="Ruiru Titans"
              style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'contain' }}
            />
            <div>
              <strong style={{ color: '#F4F2EA' }}>Ruiru Titans Football Club</strong> · 2026 Season Official Portal
              <div style={{ fontSize: '11px', color: '#5E7A6C' }}>
                League Standings · Match Results &amp; Fixtures · Cup Progression · Public TOTW &amp; TOTT
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setAuthModal({ open: true, tab: 'player' })}
              style={{
                background: 'none',
                border: 'none',
                color: '#6CE5A0',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {playerUser ? `Logged in: ${playerUser.name}` : 'Player Voting Sign-In'}
            </button>

            {!playerUser && (
              <button
                type="button"
                onClick={() => {
                  if (cmsUser && isCmsMode) {
                    setCurrentView('manage');
                  } else {
                    setAuthModal({ open: true, tab: 'cms' });
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#C9A227',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {cmsUser && isCmsMode ? 'Manager Dashboard' : 'Open Manager Dashboard'}
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Head-to-Head Modal */}
      {h2hState.open && (
        <H2HModal
          data={h2hState.data}
          loading={h2hState.loading}
          error={h2hState.error}
          onClose={() => setH2HState({ open: false, loading: false, data: null, error: null })}
        />
      )}

      {/* Dual Sign-In Modal (CMS Manager + Player Voting) */}
      <AuthModal
        isOpen={authModal.open}
        initialMode={authModal.tab}
        categories={data.categories}
        activeCategoryKey={activeCategoryKey}
        onClose={() => setAuthModal({ ...authModal, open: false })}
        onCmsSuccess={handleCmsLoginSuccess}
        onPlayerSuccess={handlePlayerLoginSuccess}
      />

      {/* Team Analytics & Profile Modal */}
      {teamModalState.open && (
        <TeamDetailModal
          teamId={teamModalState.teamId}
          categoryKey={teamModalState.categoryKey || activeCategoryKey}
          category={data.categories[teamModalState.categoryKey || activeCategoryKey]}
          allCategories={data.categories}
          activeSuspensionsMap={
            (teamModalState.categoryKey || activeCategoryKey) === activeCategoryKey
              ? suspensions
              : computeCategorySuspensions(data.categories[teamModalState.categoryKey || activeCategoryKey])
          }
          onClose={() => setTeamModalState({ open: false, teamId: null, categoryKey: null })}
          onOpenH2H={(t1, t2) => {
            setTeamModalState({ open: false, teamId: null, categoryKey: null });
            handleOpenH2H(t1, t2, teamModalState.categoryKey || activeCategoryKey);
          }}
          onSelectTeam={(newTeamId, newCatKey) => {
            setTeamModalState({
              open: true,
              teamId: newTeamId,
              categoryKey: newCatKey || teamModalState.categoryKey || activeCategoryKey,
            });
          }}
        />
      )}
    </div>
  );
}
