import React, { useState, useEffect, useRef, useMemo } from 'react';
import TopNav from './components/TopNav';
import ClubHomeView from './components/ClubHomeView';
import TableView from './components/TableView';
import FixturesView, { compareFixturesByDate, getFixtureDateSortValue } from './components/FixturesView';
import CupProgressionView from './components/CupProgressionView';
import StatsView from './components/StatsView';
import ManageView from './components/ManageView';
import TeamBalancerView from './components/TeamBalancerView';
import VotingView from './components/VotingView';
import H2HModal from './components/H2HModal';
import AuthModal from './components/AuthModal';
import TeamDetailModal from './components/TeamDetailModal';
import EditCategoryModal from './components/EditCategoryModal';
import PlayerDashboardView from './components/PlayerDashboardView';
import HighlightsView from './components/HighlightsView';
import ArchivesView from './components/ArchivesView';
import MatchReportModal from './components/MatchReportModal';
import AIWeeklyReportModal from './components/AIWeeklyReportModal';
import TacticsView from './components/TacticsView';
import { openCategoryFixturesResultsPDF } from './utils/pdfExport';
import { api } from './api/client';
import { DEFAULT_TITANS_STATE, CORE_FIVE_TEAMS } from './data/defaultState';

const PALETTE = [
  '#B23A2E', '#FF9500', '#2E5A8F', '#3F7A4E', '#7A3F8F', '#FF9500',
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

  const activeOrPlayed = rawList
    .filter((f) => f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0))
    .sort(compareFixturesByDate);
  const upcomingUnplayed = rawList
    .filter((f) => !(f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0)))
    .sort(compareFixturesByDate);
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
  const [isStandaloneTactics, setIsStandaloneTactics] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tactics_standalone') === 'true' || window.location.hash === '#tactics-standalone') {
        return true;
      }
      return localStorage.getItem('titans_tactics_dedicated_page') === 'true';
    }
    return false;
  });

  const [currentView, setCurrentView] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tactics_standalone') === 'true' || window.location.hash === '#tactics-standalone' || window.location.hash === '#tactics') {
        return 'tactics';
      }
      if (localStorage.getItem('titans_tactics_dedicated_page') === 'true') {
        return 'tactics';
      }
    }
    return 'home';
  });

  const handleToggleStandaloneTactics = (val) => {
    const next = typeof val === 'boolean' ? val : !isStandaloneTactics;
    setIsStandaloneTactics(next);
    try {
      localStorage.setItem('titans_tactics_dedicated_page', next ? 'true' : 'false');
    } catch {}
    if (next) {
      setCurrentView('tactics');
    }
  };
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
  const [newCatStartDate, setNewCatStartDate] = useState('');

  // H2H Modal state
  const [h2hState, setH2HState] = useState({ open: false, loading: false, data: null, error: null });

  // Team Analytics & Profile Modal state
  const [teamModalState, setTeamModalState] = useState({ open: false, teamId: null, categoryKey: null });

  // Edit League / Category Modal state
  const [editingCategoryKey, setEditingCategoryKey] = useState(null);

  // Match Report & AI Weekly Report Modals (Home / Championship view triggers)
  const [appReportFixture, setAppReportFixture] = useState(null);
  const [appShowAIReport, setAppShowAIReport] = useState(false);

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
          let needsReorg = false;
          const nextCategories = { ...serverState.categories };
          Object.keys(nextCategories).forEach((k) => {
            const cat = nextCategories[k];
            if (cat && cat.mode === 'league' && Array.isArray(cat.fixtures)) {
              const hasAppendedFixtures = cat.fixtures.some((f) => String(f.id || '').startsWith('REAL-F4') || String(f.id || '').startsWith('REAL-F5'));
              const f4 = cat.fixtures.find((f) => f.id === 'F4');
              const f4IsEarlyGame2 = f4 && (f4.home === 'BAL' || f4.away === 'BAL') && !f4.played;
              if (hasAppendedFixtures || f4IsEarlyGame2) {
                needsReorg = true;
                nextCategories[k] = {
                  ...cat,
                  fixtures: reorganizeLeagueUnplayedFixtures(cat),
                };
              }
            }
          });
          const finalState = needsReorg ? { ...serverState, categories: nextCategories } : serverState;
          setData(finalState);
          setSyncStatus('synced');
          if (needsReorg) {
            try {
              localStorage.setItem('ruiru_titans_react_state', JSON.stringify(finalState));
            } catch {}
          }
        }
        if (sessionInfo?.cms) {
          setCmsUser(sessionInfo.cms);
          setIsCmsMode(true);
          setPlayerUser(null);
        } else if (sessionInfo?.player) {
          setPlayerUser(sessionInfo.player);
          setCmsUser(null);
          setIsCmsMode(false);
        } else {
          setCmsUser(null);
          setIsCmsMode(false);
          setPlayerUser(null);
        }

        // Check if there was pending unsaved state that failed to save previously
        try {
          const rawPending = localStorage.getItem('ruiru_titans_pending_sync');
          if (rawPending) {
            const pending = JSON.parse(rawPending);
            if (pending && pending.categories) {
              if (sessionInfo?.cms) {
                try {
                  await api.saveState(pending);
                  localStorage.removeItem('ruiru_titans_pending_sync');
                  setData(pending);
                  setSyncStatus('synced');
                  return;
                } catch {}
              } else {
                setData(pending);
                setSyncStatus('error');
                return;
              }
            }
          }
        } catch {}
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
        try {
          localStorage.removeItem('ruiru_titans_pending_sync');
        } catch (e) {}
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync to backend:', err);
        setSyncStatus('error');
        try {
          localStorage.setItem('ruiru_titans_pending_sync', JSON.stringify(nextData));
        } catch (e) {}
        const msg = String(err?.message || '');
        if (
          msg.includes('401') ||
          msg.includes('403') ||
          msg.includes('auth') ||
          msg.includes('token') ||
          msg.includes('credentials') ||
          msg.includes('permission')
        ) {
          setAuthModal({ open: true, tab: 'cms' });
        }
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

  // Find League and Cup categories, prioritizing active non-ended campaigns with fixtures
  const leagueCategoryKey = useMemo(() => {
    if (!data?.categories) return 'ruiru-titans-league-oct-nov-2026';
    const active = data.activeCategory;
    const activeCat = active ? data.categories[active] : null;
    if (activeCat && activeCat.mode === 'league' && !activeCat.isDeleted) {
      return active;
    }
    const currentActiveLeague = Object.keys(data.categories).find((k) => {
      const c = data.categories[k];
      return c && c.mode === 'league' && !c.isEnded && !c.isDeleted;
    });
    if (currentActiveLeague) return currentActiveLeague;

    const anyLeague = Object.keys(data.categories).find((k) => {
      const c = data.categories[k];
      return c && c.mode === 'league' && !c.isDeleted;
    });
    if (anyLeague) return anyLeague;

    return active || Object.keys(data.categories)[0] || 'ruiru-titans-league-oct-nov-2026';
  }, [data]);

  const cupCategoryKey = useMemo(() => {
    if (!data?.categories) return null;
    const active = data.activeCategory;
    const activeCat = active ? data.categories[active] : null;
    if (activeCat && activeCat.mode === 'cup' && !activeCat.isEnded && !activeCat.isDeleted) return active;
    const found = Object.keys(data.categories).find((k) => {
      const c = data.categories[k];
      return c && c.mode === 'cup' && !c.isEnded && !c.isDeleted;
    });
    return found || null;
  }, [data]);

  const activeCategoryKey = useMemo(() => {
    const active = data?.activeCategory;
    const activeCat = active ? data?.categories?.[active] : null;
    if (activeCat && !activeCat.isDeleted) {
      return active;
    }
    return leagueCategoryKey;
  }, [data, leagueCategoryKey]);

  const cat = data?.categories?.[activeCategoryKey] || data?.categories?.[leagueCategoryKey];
  const leagueCat = data?.categories?.[leagueCategoryKey] || cat;
  const cupCat = cupCategoryKey ? data?.categories?.[cupCategoryKey] : null;
  const effectiveCategoryKey = activeCategoryKey || leagueCategoryKey;

  // Active competitions list for navigation and switcher (only real active non-ended tournaments)
  const activeCompetitionsList = useMemo(() => {
    return Object.entries(data?.categories || {}).filter(([k, c]) => {
      if (c.isEnded || c.isDeleted) return false;
      const fixCount = (c.fixtures || []).length + Object.values(c.groupFixtures || {}).flat().length;
      const playerCount = (c.teams || []).reduce((acc, t) => acc + (t.players || []).length, 0);
      return fixCount > 0 || playerCount > 0;
    });
  }, [data]);

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
      const isPlayed = Boolean(f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0));
      if (!isPlayed) return;
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
    const isCompleted = (f) => Boolean(f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0));
    const completedResults = lFixtures.filter(isCompleted);
    const upcomingFixtures = lFixtures.filter((f) => !isCompleted(f));
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

  const isFixturePlayedOrCompleted = (f) => {
    if (!f) return false;
    if (f.played || f.walkover) return true;
    if (Array.isArray(f.events) && f.events.length > 0) return true;
    if (f.match && (f.match.played || f.match.walkover || (Array.isArray(f.match.events) && f.match.events.length > 0))) return true;
    if (f.winner || (f.home_score !== undefined && f.home_score !== '') || (f.score1 !== undefined && f.score1 !== '')) return true;
    return false;
  };

  const syncCupGroupFixtures = (c, nextFixtures) => {
    if (!c.groupFixtures) return undefined;
    const byId = {};
    (nextFixtures || []).forEach((f) => {
      byId[f.id] = f;
    });
    const nextGroupFixtures = {};
    Object.entries(c.groupFixtures).forEach(([letter, list]) => {
      nextGroupFixtures[letter] = (list || []).map((gf) => {
        const updated = byId[gf.id];
        if (!updated) return gf;
        if (isFixturePlayedOrCompleted(gf)) {
          return {
            ...updated,
            played: true,
            referee: gf.referee || updated.referee,
            events: (gf.events && gf.events.length > 0) ? gf.events : updated.events,
            walkover: gf.walkover || updated.walkover,
          };
        }
        return updated;
      });
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
      const rounds = (c.rounds || []).map((r) =>
        Array.isArray(r)
          ? r.map((t) =>
              t?.id === fId
                ? {
                    ...t,
                    match: {
                      ...t.match,
                      played: true,
                      events: [...(t.match?.events || []), event],
                    },
                  }
                : t
            )
          : {
              ...r,
              ties: (r.ties || []).map((t) =>
                t.id === fId
                  ? {
                      ...t,
                      played: true,
                      events: [...(t.events || []), event],
                    }
                  : t
              ),
            }
      );
      return {
        ...c,
        fixtures,
        ...(groupFixtures ? { groupFixtures } : {}),
        ...(c.rounds ? { rounds } : {}),
      };
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
      const rounds = (c.rounds || []).map((r) =>
        Array.isArray(r)
          ? r.map((t) =>
              t?.id === fId
                ? {
                    ...t,
                    match: {
                      ...t.match,
                      events: (t.match?.events || []).filter((_, idx) => idx !== eventIndex),
                    },
                  }
                : t
            )
          : {
              ...r,
              ties: (r.ties || []).map((t) =>
                t.id === fId
                  ? {
                      ...t,
                      events: (t.events || []).filter((_, idx) => idx !== eventIndex),
                    }
                  : t
              ),
            }
      );
      return {
        ...c,
        fixtures,
        ...(groupFixtures ? { groupFixtures } : {}),
        ...(c.rounds ? { rounds } : {}),
      };
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

  const handleSaveFixtureReport = (fId, reportData, targetKey = activeCategoryKey) => {
    updateCategoryByKey(targetKey, (c) => {
      const fixtures = (c.fixtures || []).map((f) => (f.id === fId ? { ...f, report: reportData } : f));
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

  const handleAddPlayers = (
    teamId,
    namesOrPlayerObj,
    position = '',
    customUsername = '',
    customPassword = '',
    targetCategoryKey = null,
    specificPlayerId = null,
    jerseyNumber = null
  ) => {
    // Normalize names to an array
    let names = [];
    if (Array.isArray(namesOrPlayerObj)) {
      names = namesOrPlayerObj.map((n) => (typeof n === 'string' ? n.trim() : (n?.name || '').trim())).filter(Boolean);
    } else if (typeof namesOrPlayerObj === 'string') {
      names = namesOrPlayerObj.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    } else if (namesOrPlayerObj && typeof namesOrPlayerObj === 'object') {
      if (namesOrPlayerObj.name) names = [namesOrPlayerObj.name.trim()];
      if (namesOrPlayerObj.id && !specificPlayerId) specificPlayerId = namesOrPlayerObj.id;
      if (namesOrPlayerObj.position && !position) position = namesOrPlayerObj.position;
      if (namesOrPlayerObj.username && !customUsername) customUsername = namesOrPlayerObj.username;
      if (namesOrPlayerObj.jersey_number && !jerseyNumber) jerseyNumber = namesOrPlayerObj.jersey_number;
    }

    if (!names.length) return null;

    const cleanPos = typeof position === 'string' ? position.trim() : (Array.isArray(position) ? String(position[0] || '').trim() : '');
    const cleanUname = typeof customUsername === 'string' ? customUsername.trim() : (Array.isArray(customUsername) ? String(customUsername[0] || '').trim() : '');
    const cleanPass = typeof customPassword === 'string' ? customPassword.trim() : '';

    let newlyCreatedFirstPlayerId = null;

    // Determine which categories contain this teamId
    const catKeysToUpdate = new Set();
    if (targetCategoryKey && data?.categories?.[targetCategoryKey]) {
      catKeysToUpdate.add(targetCategoryKey);
    }
    // Also check all categories to ensure the team roster stays updated in every competition
    Object.keys(data?.categories || {}).forEach((k) => {
      const c = data.categories[k];
      if (c?.teams?.some((t) => t.id === teamId)) {
        catKeysToUpdate.add(k);
      }
    });

    // Fallback to activeCategoryKey or leagueCategoryKey if team wasn't located in any category yet
    if (catKeysToUpdate.size === 0) {
      if (activeCategoryKey && data?.categories?.[activeCategoryKey]) {
        catKeysToUpdate.add(activeCategoryKey);
      } else if (leagueCategoryKey && data?.categories?.[leagueCategoryKey]) {
        catKeysToUpdate.add(leagueCategoryKey);
      }
    }

    const nextCategories = { ...data.categories };

    catKeysToUpdate.forEach((catKey) => {
      const currentCat = nextCategories[catKey];
      if (!currentCat || !Array.isArray(currentCat.teams)) return;

      const teams = currentCat.teams.map((t) => {
        if (t.id === teamId) {
          const existingIds = new Set((t.players || []).map((p) => p.id));
          let nextSeq = 1;
          (t.players || []).forEach((p) => {
            const match = String(p.id || '').match(/-P(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num >= nextSeq) nextSeq = num + 1;
            }
          });

          const newPlayers = names.map((n, idx) => {
            let permId = specificPlayerId && idx === 0 ? specificPlayerId : null;
            if (!permId) {
              while (existingIds.has(`${t.id}-P${nextSeq}`)) {
                nextSeq++;
              }
              permId = `${t.id}-P${nextSeq}`;
              nextSeq++;
            }
            existingIds.add(permId);

            if (!newlyCreatedFirstPlayerId && idx === 0) {
              newlyCreatedFirstPlayerId = permId;
            }

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
              username: idx === 0 && cleanUname ? cleanUname.toLowerCase() : defaultUname,
              password: cleanPass || '',
              position: cleanPos || '',
              jersey_number: jerseyNumber || undefined,
            };
          });

          return { ...t, players: [...(t.players || []), ...newPlayers] };
        }
        return t;
      });

      nextCategories[catKey] = { ...currentCat, teams };
    });

    commitData({ ...data, categories: nextCategories });
    return newlyCreatedFirstPlayerId;
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

  const handleMovePlayer = (fromTeamId, toTeamId, playerId, targetCategoryKey = activeCategoryKey) => {
    if (!fromTeamId || !toTeamId || !playerId || fromTeamId === toTeamId) return;
    updateCategoryByKey(targetCategoryKey, (c) => {
      let playerToMove = null;
      const nextTeams = (c.teams || []).map((t) => {
        if (t.id === fromTeamId) {
          const p = (t.players || []).find((x) => x.id === playerId);
          if (p) playerToMove = { ...p };
          return {
            ...t,
            players: (t.players || []).filter((x) => x.id !== playerId),
          };
        }
        return t;
      });

      if (!playerToMove) return c;

      const finalTeams = nextTeams.map((t) => {
        if (t.id === toTeamId) {
          return {
            ...t,
            players: [...(t.players || []), playerToMove],
          };
        }
        return t;
      });

      return { ...c, teams: finalTeams };
    });
  };

  const handleIntelligentlyAddPlayerToCategory = (
    names,
    position = '',
    customUsername = '',
    customPassword = '',
    targetCategoryKey = activeCategoryKey
  ) => {
    updateCategoryByKey(targetCategoryKey, (c) => {
      const teams = [...(c.teams || [])];
      if (!teams.length) return c;

      const updatedTeams = teams.map((t) => ({ ...t, players: [...(t.players || [])] }));

      names.forEach((name) => {
        updatedTeams.sort((a, b) => {
          const diff = a.players.length - b.players.length;
          if (diff !== 0) return diff;
          if (position) {
            const aHasPos = a.players.some((p) => p.position === position);
            const bHasPos = b.players.some((p) => p.position === position);
            if (aHasPos !== bHasPos) return aHasPos ? 1 : -1;
          }
          return 0;
        });

        const targetTeam = updatedTeams[0];
        const existingIds = new Set(targetTeam.players.map((p) => p.id));
        let nextSeq = 1;
        targetTeam.players.forEach((p) => {
          const match = String(p.id || '').match(/-P(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= nextSeq) nextSeq = num + 1;
          }
        });
        while (existingIds.has(`${targetTeam.id}-P${nextSeq}`)) {
          nextSeq++;
        }
        const permId = `${targetTeam.id}-P${nextSeq}`;
        const defaultUname =
          name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '') || permId.toLowerCase();

        targetTeam.players.push({
          id: permId,
          permanentId: permId,
          name: name.trim(),
          username: customUsername.trim() ? customUsername.trim().toLowerCase() : defaultUname,
          password: customPassword.trim() || '',
          position: position || '',
        });
      });

      return { ...c, teams: updatedTeams };
    });
  };

  const handleSaveCategorySettings = (catKey, updatedFields, rescheduleUnplayed = false) => {
    updateCategoryByKey(catKey, (c) => {
      const merged = { ...c, ...updatedFields };
      const newVenue = merged.schedule?.venue;

      let currentFixtures = (c.fixtures || []).map((f) => {
        if (!f.played && !f.walkover && newVenue) {
          return { ...f, venue: newVenue };
        }
        return f;
      });

      if (!rescheduleUnplayed) {
        return {
          ...merged,
          fixtures: currentFixtures,
        };
      }

      const unplayedFixtures = currentFixtures.filter((f) => !f.played && !f.walkover);
      const newSlots = computeScheduleSlots(unplayedFixtures.length, merged.schedule);
      let slotIdx = 0;
      const updatedFixtures = currentFixtures.map((f) => {
        if (!f.played && !f.walkover) {
          const nextDate = newSlots[slotIdx] || f.date;
          slotIdx++;
          return { ...f, date: nextDate, ...(newVenue ? { venue: newVenue } : {}) };
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
                    return {
                      ...t,
                      date: matchFix.date,
                      ...(newVenue ? { venue: newVenue } : {}),
                      match: {
                        ...(t.match || {}),
                        date: matchFix.date,
                        ...(newVenue ? { venue: newVenue } : {}),
                      },
                    };
                  }
                  return t;
                })
              : r
          )
        : undefined;

      return {
        ...merged,
        fixtures: updatedFixtures,
        ...(updatedGroupFixtures ? { groupFixtures: updatedGroupFixtures } : {}),
        ...(updatedRounds ? { rounds: updatedRounds } : {}),
      };
    });
  };

  const handleUpdatePlayerPosition = (teamId, playerId, newPosition) => {
    const cleanPos = newPosition || '';
    updateActiveCat((c) => {
      const teams = c.teams.map((t) => {
        if (t.id === teamId) {
          return {
            ...t,
            players: t.players.map((p) => (p.id === playerId ? { ...p, position: cleanPos } : p)),
          };
        }
        return t;
      });
      return { ...c, teams };
    });
    api.updatePlayerPosition({
      team_id: teamId,
      player_id: playerId,
      position: cleanPos,
      category_key: activeCategoryKey,
    }).catch((err) => {
      console.warn('Backend updatePlayerPosition error:', err);
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

      // Automatically assign random referees ONLY to unplayed fixtures that don't have one yet
      const fixtures = (c.fixtures || []).map((f) =>
        !isFixturePlayedOrCompleted(f) && !f.referee
          ? { ...f, referee: pickRandomReferee(merged) }
          : f
      );
      const groupFixtures = syncCupGroupFixtures(c, fixtures);
      const rounds = c.rounds
        ? (c.rounds || []).map((r) => {
            if (Array.isArray(r)) {
              return r.map((t) => {
                if (!t || isFixturePlayedOrCompleted(t) || t.referee || t.match?.referee) return t;
                const rand = pickRandomReferee(merged);
                return { ...t, referee: rand, match: { ...(t.match || {}), referee: rand } };
              });
            } else if (r && typeof r === 'object' && Array.isArray(r.ties)) {
              return {
                ...r,
                ties: r.ties.map((t) => {
                  if (!t || isFixturePlayedOrCompleted(t) || t.referee || t.match?.referee) return t;
                  const rand = pickRandomReferee(merged);
                  return { ...t, referee: rand, match: { ...(t.match || {}), referee: rand } };
                }),
              };
            }
            return r;
          })
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

      // Map existing completed/played fixture IDs across all structures so they are NEVER modified
      const completedFixtureIds = new Set();
      (c.fixtures || []).forEach((f) => {
        if (isFixturePlayedOrCompleted(f)) completedFixtureIds.add(f.id);
      });
      if (c.groupFixtures) {
        Object.values(c.groupFixtures).forEach((list) => {
          (list || []).forEach((f) => {
            if (isFixturePlayedOrCompleted(f)) completedFixtureIds.add(f.id);
          });
        });
      }
      if (c.rounds) {
        (c.rounds || []).forEach((r) => {
          const ties = Array.isArray(r) ? r : (r?.ties || []);
          ties.forEach((t) => {
            if (isFixturePlayedOrCompleted(t)) completedFixtureIds.add(t.id);
          });
        });
      }

      const refByFixId = {};
      const fixtures = (c.fixtures || []).map((f) => {
        if (completedFixtureIds.has(f.id) || isFixturePlayedOrCompleted(f)) {
          return f; // Strictly preserve played fixture referee
        }
        updatedCount++;
        const rand = pickRandomReferee(pool);
        refByFixId[f.id] = rand;
        return { ...f, referee: rand };
      });

      const groupFixtures = c.groupFixtures
        ? Object.fromEntries(
            Object.entries(c.groupFixtures).map(([letter, list]) => [
              letter,
              (list || []).map((f) => {
                if (completedFixtureIds.has(f.id) || isFixturePlayedOrCompleted(f)) {
                  return f; // Strictly preserve played group fixture referee
                }
                const rand = refByFixId[f.id] || pickRandomReferee(pool);
                refByFixId[f.id] = rand;
                return { ...f, referee: rand };
              }),
            ])
          )
        : undefined;

      const rounds = c.rounds
        ? (c.rounds || []).map((r) => {
            if (Array.isArray(r)) {
              return r.map((t) => {
                if (!t || completedFixtureIds.has(t.id) || isFixturePlayedOrCompleted(t)) {
                  return t; // Strictly preserve played knockout tie referee
                }
                updatedCount++;
                const rand = refByFixId[t.id] || pickRandomReferee(pool);
                refByFixId[t.id] = rand;
                return { ...t, referee: rand, match: { ...(t.match || {}), referee: rand } };
              });
            } else if (r && typeof r === 'object' && Array.isArray(r.ties)) {
              return {
                ...r,
                ties: r.ties.map((t) => {
                  if (!t || completedFixtureIds.has(t.id) || isFixturePlayedOrCompleted(t)) {
                    return t; // Strictly preserve played knockout tie referee
                  }
                  updatedCount++;
                  const rand = refByFixId[t.id] || pickRandomReferee(pool);
                  refByFixId[t.id] = rand;
                  return { ...t, referee: rand, match: { ...(t.match || {}), referee: rand } };
                }),
              };
            }
            return r;
          })
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
      schedule: {
        time: '18:00',
        days: { 3: 1, 4: 1, 5: 1, 6: 1 },
        ...(newCatStartDate ? { startDate: newCatStartDate, start_date: newCatStartDate } : {}),
      },
      referees: parsedRefs,
      votingConfig: { team_size: 6, max_picks_per_position: 2, include_gk: true },
    };
    const nextCategories = { ...data.categories, [slug]: newCat };
    commitData({ ...data, categories: nextCategories, activeCategory: slug });
    setNewCatName('');
    setNewCatStartDate('');
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

    let baseDate = null;
    const rawStartDate = schedule?.startDate || schedule?.start_date;
    if (rawStartDate) {
      if (typeof rawStartDate === 'string') {
        const parts = rawStartDate.trim().split(/[-/]/);
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const d = parseInt(parts[2], 10);
          if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            baseDate = new Date(y, m, d);
          }
        }
      } else if (rawStartDate instanceof Date && !isNaN(rawStartDate.getTime())) {
        baseDate = new Date(rawStartDate.getTime());
      }
    }
    if (!baseDate || isNaN(baseDate.getTime())) {
      baseDate = new Date();
    }

    const cur = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
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
        fixtures: updatedFixtures.slice().sort(compareFixturesByDate),
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
        fixtures: updatedFixtures.slice().sort(compareFixturesByDate),
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
        const dateStr = scheduledDates[slotIdx] || scheduledDates[scheduledDates.length - 1] || 'TBD · 15:00';
        slotIdx++;
        fixtures.push({
          id: `F${seq}`,
          round: pair.round,
          date: dateStr,
          venue: schedule.venue || 'Thoome Pri.',
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

  const reorganizeLeagueUnplayedFixtures = (category, newlyAddedTeamId = null) => {
    if (!category || category.mode === 'cup') return category?.fixtures || [];

    const allFixtures = [...(category.fixtures || [])];
    const teams = category.teams || [];
    const teamIds = teams.map((t) => t.id);
    if (teamIds.length < 2) return allFixtures;

    // 1. Separate played vs unplayed (played matches are frozen and untouched)
    const playedFixtures = [];
    const unplayedFixtures = [];

    allFixtures.forEach((f) => {
      const isPlayed = Boolean(f.played) || (f.events && f.events.length > 0) || Boolean(f.walkover) || (f.score1 != null && f.score2 != null);
      if (isPlayed) {
        playedFixtures.push(f);
      } else {
        unplayedFixtures.push(f);
      }
    });

    if (unplayedFixtures.length === 0) {
      return playedFixtures;
    }

    // 2. Count played matches per team and track head-to-head encounters
    const playedCount = {};
    const scheduledCount = {};
    const h2hCount = {};
    const h2hKey = (u, v) => (String(u) < String(v) ? `${u}::${v}` : `${v}::${u}`);

    const canTeamsMeet = (hId, aId) => {
      // Invariant: Two teams that have met k times (k >= 1) cannot meet again
      // until both teams have played all other teams in the league at least k times.
      if (!hId || !aId || hId === aId) return true;
      const k = h2hCount[h2hKey(hId, aId)] || 0;
      if (k === 0) return true;
      for (let i = 0; i < teamIds.length; i++) {
        const otherId = teamIds[i];
        if (otherId !== hId && (h2hCount[h2hKey(hId, otherId)] || 0) < k) {
          return false;
        }
        if (otherId !== aId && (h2hCount[h2hKey(aId, otherId)] || 0) < k) {
          return false;
        }
      }
      return true;
    };

    teamIds.forEach((id) => {
      playedCount[id] = 0;
      scheduledCount[id] = 0;
    });

    playedFixtures.forEach((f) => {
      if (f.home && playedCount[f.home] !== undefined) playedCount[f.home]++;
      if (f.away && playedCount[f.away] !== undefined) playedCount[f.away]++;
      if (f.home && f.away) {
        const k = h2hKey(f.home, f.away);
        h2hCount[k] = (h2hCount[k] || 0) + 1;
      }
    });

    teamIds.forEach((id) => {
      scheduledCount[id] = playedCount[id] || 0;
    });

    // 3. Extract the available unplayed match slots
    const schedule = category.schedule || {
      start_date: '2026-10-22',
      match_days: ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Monday'],
      match_times: ['17:10', '18:10'],
      venue: 'Thoome Pri.',
    };

    const existingUnplayedSlots = unplayedFixtures.map((f) => ({
      date: f.date,
      venue: f.venue || schedule.venue || 'Thoome Pri.',
    }));

    const totalSlotsNeeded = playedFixtures.length + unplayedFixtures.length + 30;
    const computedSlots = computeScheduleSlots(totalSlotsNeeded, schedule);

    const availableSlots = [];
    existingUnplayedSlots
      .slice()
      .sort((a, b) => getFixtureDateSortValue(a.date) - getFixtureDateSortValue(b.date))
      .forEach((s) => {
        if (s.date && s.date !== 'TBD' && !s.date.includes('Upcoming Weekend')) {
          availableSlots.push(s);
        }
      });

    let cIdx = playedFixtures.length;
    while (availableSlots.length < unplayedFixtures.length + 20) {
      const slotStr = computedSlots[cIdx] || 'Upcoming Weekend · 16:00';
      availableSlots.push({ date: slotStr, venue: schedule.venue || 'Thoome Pri.' });
      cIdx++;
    }

    // 4. Referees pool
    const referees = (category.referees && category.referees.length > 0)
      ? category.referees
      : ['Ref Kamau', 'Ref Otieno', 'Ref Njoroge', 'Ref Wanjohi'];

    // 5. Intelligent Round-by-Round Equalized Scheduler
    // Strict Invariant: "any team should not play one more game before the new team has played"
    // - Catch-up matches (teams with 0 games) MUST be scheduled into the earliest unplayed slots.
    // - Teams that played yesterday have played game 1 and cannot play game 2 until all trailing teams have equalized.
    // - Masters (and any team) playing game 1 today cannot play game 2 before the new team plays game 1.
    const unplayedPool = [...unplayedFixtures];
    const reorderedUnplayed = [];
    const lastPlayedSlot = {};
    teamIds.forEach((id) => { lastPlayedSlot[id] = -999; });

    // Populate recent slots for played fixtures to ensure proper rest spacing
    playedFixtures.forEach((f, idx) => {
      const pseudoSlot = idx - playedFixtures.length;
      if (f.home) lastPlayedSlot[f.home] = pseudoSlot;
      if (f.away) lastPlayedSlot[f.away] = pseudoSlot;
    });

    let roundTeamsScheduled = new Set();
    let slot = 0;

    while (unplayedPool.length > 0) {
      const minGames = Math.min(...teamIds.map((id) => scheduledCount[id] || 0));
      const maxGames = Math.max(...teamIds.map((id) => scheduledCount[id] || 0));

      let bestIdx = -1;
      let bestScore = -Infinity;

      if (minGames < maxGames) {
        // CATCH-UP PHASE:
        // Only trailing teams (those with scheduledCount === minGames) are eligible to play!
        const trailingTeams = new Set(teamIds.filter((id) => (scheduledCount[id] || 0) === minGames));

        for (let i = 0; i < unplayedPool.length; i++) {
          const m = unplayedPool[i];
          const hTrail = trailingTeams.has(m.home);
          const aTrail = trailingTeams.has(m.away);

          // Invariant: Do not schedule a match between two non-trailing teams while teams are behind!
          if (!hTrail && !aTrail) continue;

          // Invariant: Two teams that have met k times cannot meet again until they have played all other teams
          if (!canTeamsMeet(m.home, m.away)) continue;

          let score = 0;
          if (hTrail && aTrail) {
            score += 50000; // Both are trailing: ideal catch-up match!
          } else {
            // One trailing, one not trailing (only used if odd number of trailing teams)
            score += 1000;
            if (trailingTeams.size >= 2) score -= 30000;
          }

          if (newlyAddedTeamId && (m.home === newlyAddedTeamId || m.away === newlyAddedTeamId)) {
            score += 15000; // Give top priority to new team in the earliest catch-up slot
          }

          const h2h = h2hCount[h2hKey(m.home, m.away)] || 0;
          if (h2h > 0) score -= 20000; // Prefer fresh matchups

          if (lastPlayedSlot[m.home] === slot - 1 || lastPlayedSlot[m.away] === slot - 1) {
            score -= 2000;
          }

          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }

        if (bestIdx === -1) {
          // Fallback within catch-up phase: find match that satisfies canTeamsMeet
          for (let i = 0; i < unplayedPool.length; i++) {
            const m = unplayedPool[i];
            if (!canTeamsMeet(m.home, m.away)) continue;
            const sumCount = (scheduledCount[m.home] || 0) + (scheduledCount[m.away] || 0);
            const score = 1000 - sumCount * 50;
            if (score > bestScore) {
              bestScore = score;
              bestIdx = i;
            }
          }
        }
      } else {
        // NORMAL ROUND PHASE:
        // Each team plays exactly once per round before ANY team plays in the next round!
        if (roundTeamsScheduled.size >= teamIds.length - (teamIds.length % 2)) {
          roundTeamsScheduled.clear();
        }

        const currentTarget = minGames + 1;

        for (let i = 0; i < unplayedPool.length; i++) {
          const m = unplayedPool[i];
          const hIn = roundTeamsScheduled.has(m.home);
          const aIn = roundTeamsScheduled.has(m.away);

          // In this round, neither team can have already been scheduled
          if (hIn || aIn) continue;

          // Strict round cap: neither team can exceed the current round target
          if ((scheduledCount[m.home] || 0) >= currentTarget || (scheduledCount[m.away] || 0) >= currentTarget) {
            continue;
          }

          // Invariant: Two teams that have met k times cannot meet again until they have played all other teams
          if (!canTeamsMeet(m.home, m.away)) continue;

          let score = 2000;

          // Fresh matchup preference
          const h2h = h2hCount[h2hKey(m.home, m.away)] || 0;
          if (h2h === 0) score += 5000;
          else score -= 10000;

          // Fatigue spacing: prefer teams that have rested longer
          const gapH = slot - (lastPlayedSlot[m.home] ?? -999);
          const gapA = slot - (lastPlayedSlot[m.away] ?? -999);
          score += Math.min(gapH, gapA) * 100;

          if (gapH <= 1 || gapA <= 1) score -= 5000;
          if (gapH <= 2 || gapA <= 2) score -= 1000;

          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }

        if (bestIdx === -1) {
          // If no strictly disjoint match found under current target, reset round set and find match with minimum sum count satisfying canTeamsMeet
          roundTeamsScheduled.clear();
          for (let i = 0; i < unplayedPool.length; i++) {
            const m = unplayedPool[i];
            if (!canTeamsMeet(m.home, m.away)) continue;
            const sumCount = (scheduledCount[m.home] || 0) + (scheduledCount[m.away] || 0);
            let score = 1000 - sumCount * 50;
            const gapH = slot - (lastPlayedSlot[m.home] ?? -999);
            const gapA = slot - (lastPlayedSlot[m.away] ?? -999);
            score += Math.min(gapH, gapA) * 10;
            if (score > bestScore) {
              bestScore = score;
              bestIdx = i;
            }
          }
        }
      }

      if (bestIdx === -1) {
        for (let i = 0; i < unplayedPool.length; i++) {
          if (canTeamsMeet(unplayedPool[i].home, unplayedPool[i].away)) {
            bestIdx = i;
            break;
          }
        }
      }

      if (bestIdx === -1) bestIdx = 0;

      const [chosenMatch] = unplayedPool.splice(bestIdx, 1);
      const slotInfo = availableSlots[slot] || { date: 'Upcoming Weekend · 16:00', venue: schedule.venue || 'Thoome Pri.' };
      const assignedRef = chosenMatch.referee || referees[slot % referees.length];

      const updatedMatch = {
        ...chosenMatch,
        date: slotInfo.date,
        venue: chosenMatch.venue || slotInfo.venue,
        referee: assignedRef,
      };

      scheduledCount[chosenMatch.home] = (scheduledCount[chosenMatch.home] || 0) + 1;
      scheduledCount[chosenMatch.away] = (scheduledCount[chosenMatch.away] || 0) + 1;
      roundTeamsScheduled.add(chosenMatch.home);
      roundTeamsScheduled.add(chosenMatch.away);
      lastPlayedSlot[chosenMatch.home] = slot;
      lastPlayedSlot[chosenMatch.away] = slot;
      const k = h2hKey(chosenMatch.home, chosenMatch.away);
      h2hCount[k] = (h2hCount[k] || 0) + 1;

      reorderedUnplayed.push(updatedMatch);
      slot++;
    }

    // 6. Sequential ID renumbering after played fixtures
    let maxPlayedSeq = 0;
    let prefix = 'F';
    playedFixtures.forEach((f) => {
      const mReal = String(f.id || '').match(/REAL-F(\d+)/i);
      if (mReal) {
        prefix = 'REAL-F';
        const num = parseInt(mReal[1], 10);
        if (num > maxPlayedSeq) maxPlayedSeq = num;
      } else {
        const mF = String(f.id || '').match(/^F(\d+)$/i);
        if (mF) {
          const num = parseInt(mF[1], 10);
          if (num > maxPlayedSeq) maxPlayedSeq = num;
        }
      }
    });

    let seq = maxPlayedSeq;
    const finalUnplayed = reorderedUnplayed.map((m) => {
      seq++;
      return {
        ...m,
        id: `${prefix}${seq}`,
      };
    });

    return [...playedFixtures, ...finalUnplayed];
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
          const dateStr = groupScheduledDates[slotIdx] || groupScheduledDates[groupScheduledDates.length - 1] || 'TBD · 15:00';
          slotIdx++;
          const fObj = {
            id: `GF-${letter}-${gSeq}`,
            round: pair.round,
            group: letter,
            date: dateStr,
            venue: schedule.venue || 'Thoome Pri.',
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
      const date = koScheduledDates[koSlotIdx] || koScheduledDates[koScheduledDates.length - 1] || 'TBD · 15:00';
      koSlotIdx++;
      return {
        id,
        stage,
        date,
        venue: schedule.venue || 'Thoome Pri.',
        home,
        away,
        referee: ref,
        match: { played: false, events: [], referee: ref, venue: schedule.venue || 'Thoome Pri.' },
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
    const CORE_CLUBS = [
      { id: 'MAN', name: 'Mancheli', color: '#FF9500' },
      { id: 'SS', name: 'Super Strikers', color: '#B23A2E' },
      { id: 'RAN', name: 'Rangers', color: '#3F7A4E' },
      { id: 'MAS', name: 'Masters', color: '#FF9500' },
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
          return {
            id: permId,
            permanentId: permId,
            name: p.name,
            username: defaultUname,
            password: '',
            position: p.position || '',
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
    incomingReferees = [],
    startDate = '',
    venue = 'Thoome Pri.'
  ) => {
    const currentCat = data.categories[targetKey] || cat;
    const baseTeams = replaceExisting ? [] : currentCat?.teams || [];
    const createdTeams = buildTournamentTeamsFromBalanced(balancedTeams, baseTeams);
    const finalTeams = [...baseTeams, ...createdTeams];
    const baseSchedule = currentCat?.schedule || { time: '15:00', days: { 6: 1, 0: 1 } };
    const schedule = {
      ...baseSchedule,
      venue: (venue && venue.trim()) || baseSchedule.venue || 'Thoome Pri.',
      ...(startDate ? { startDate, start_date: startDate } : {}),
    };
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
        schedule,
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
        schedule,
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
    incomingReferees = [],
    startDate = '',
    venue = 'Thoome Pri.'
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
    const schedule = {
      time: '15:00',
      days: { 6: 1, 0: 1 },
      venue: (venue && venue.trim()) || 'Thoome Pri.',
      ...(startDate ? { startDate, start_date: startDate } : {}),
    };
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

  const handleCreateLeagueTeam = ({
    teamName,
    teamCode,
    teamColor,
    initialPlayers = [],
    transferredPlayerIds = [],
    autoBalanceCount = 0,
    generateFixtures = true,
    fixtureFormat = 'double',
    targetCategoryKey = activeCategoryKey,
  }) => {
    let resultSummary = null;
    updateCategoryByKey(targetCategoryKey, (c) => {
      const name = (teamName || '').trim();
      if (!name) return c;

      // 1. Generate unique team ID / code
      let code = (teamCode || name.slice(0, 3)).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!code) code = 'NEW';
      let finalCode = code;
      let counter = 1;
      const existingTeamIds = new Set((c.teams || []).map((t) => t.id));
      while (existingTeamIds.has(finalCode)) {
        finalCode = `${code}${counter++}`;
      }

      const color = teamColor || PALETTE[(c.teams || []).length % PALETTE.length];

      // Unknown scorer placeholder for this team
      const newPlayers = [
        { id: `${finalCode}-UNK`, name: 'Unrecorded scorer', unknown: true },
      ];

      // 2. Add manual initial players
      let pSeq = 1;
      (initialPlayers || []).forEach((p) => {
        const pName = (p.name || '').trim();
        if (!pName) return;
        const pId = `${finalCode}-P${pSeq++}`;
        const defaultUname = pName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '') || pId.toLowerCase();
        newPlayers.push({
          id: pId,
          permanentId: pId,
          name: pName,
          username: (p.username || defaultUname).trim().toLowerCase(),
          password: p.password || '',
          position: p.position || '',
          jerseyNumber: p.jerseyNumber != null && String(p.jerseyNumber).trim() !== '' ? parseInt(p.jerseyNumber, 10) : null,
          isActive: true,
        });
      });

      // 3. Process manual transfers from other teams
      const transferSet = new Set((transferredPlayerIds || []).map((t) => `${t.fromTeamId}::${t.playerId}`));
      const playersToTransfer = [];

      let updatedTeams = (c.teams || []).map((team) => {
        const remainingPlayers = [];
        (team.players || []).forEach((p) => {
          if (transferSet.has(`${team.id}::${p.id}`) && !p.unknown) {
            playersToTransfer.push({ ...p, previousTeamId: team.id });
          } else {
            remainingPlayers.push(p);
          }
        });
        return { ...team, players: remainingPlayers };
      });

      // 4. Process Intelligent Competitive Auto-Pull (if enabled)
      const pullTarget = parseInt(autoBalanceCount || 0, 10);
      if (pullTarget > 0) {
        const classifyPos = (pos) => {
          const u = (pos || '').toUpperCase();
          if (u.includes('GK')) return 'GK';
          if (u.includes('DEF') || u.includes('CB') || u.includes('LB') || u.includes('RB')) return 'DEF';
          if (u.includes('MID') || u.includes('CDM') || u.includes('CAM') || u.includes('CM')) return 'MID';
          if (u.includes('FWD') || u.includes('ST') || u.includes('RW') || u.includes('LW') || u.includes('CF')) return 'FWD';
          return 'OTHER';
        };

        const targetPositions = ['GK', 'DEF', 'MID', 'DEF', 'MID', 'FWD', 'OTHER'];
        let pulled = 0;

        while (pulled < pullTarget) {
          // Identify donor teams with squad size > 5, sorted by largest squad first
          const eligibleTeams = updatedTeams
            .filter((t) => (t.players || []).filter((p) => !p.unknown).length > 5)
            .sort((a, b) => {
              const countA = (a.players || []).filter((p) => !p.unknown).length;
              const countB = (b.players || []).filter((p) => !p.unknown).length;
              return countB - countA;
            });

          if (eligibleTeams.length === 0) break; // Preserve minimum 5 players on all teams

          const donorTeam = eligibleTeams[pulled % eligibleTeams.length];
          const donorPlayers = donorTeam.players.filter((p) => !p.unknown);
          const desiredPos = targetPositions[pulled % targetPositions.length];

          let candidate = donorPlayers.find((p) => classifyPos(p.position) === desiredPos);
          if (!candidate) {
            candidate = donorPlayers[donorPlayers.length - 1];
          }

          if (candidate) {
            donorTeam.players = donorTeam.players.filter((p) => p.id !== candidate.id);
            playersToTransfer.push({ ...candidate, previousTeamId: donorTeam.id });
            pulled++;
          } else {
            break;
          }
        }
      }

      // Add all transferred/pulled players into newTeam, preserving permanent IDs, credentials, and stats
      playersToTransfer.forEach((tp) => {
        newPlayers.push({
          ...tp,
          id: tp.permanentId || tp.id,
          name: tp.name,
          username: tp.username,
          password: tp.password,
          position: tp.position || '',
          jerseyNumber: tp.jerseyNumber ?? tp.jersey_number ?? null,
          isActive: tp.isActive ?? tp.is_active ?? true,
        });
      });

      const newTeam = {
        id: finalCode,
        name: name,
        color: color,
        players: newPlayers,
      };

      updatedTeams.push(newTeam);

      // 5. Generate League Fixtures against all other teams
      let updatedFixtures = [...(c.fixtures || [])];
      let newMatchesCount = 0;

      if (c.mode === 'cup') {
        const groupLetters = c.groupLetters || ['A', 'B'];
        const groupCounts = {};
        groupLetters.forEach((l) => { groupCounts[l] = 0; });
        (c.teams || []).forEach((t) => {
          const g = (c.groupOf || {})[t.id] || groupLetters[0];
          if (groupCounts[g] !== undefined) groupCounts[g]++;
        });
        let minGroup = groupLetters[0];
        groupLetters.forEach((l) => {
          if (groupCounts[l] < groupCounts[minGroup]) minGroup = l;
        });

        const newGroupOf = { ...(c.groupOf || {}), [finalCode]: minGroup };
        const groupOpponents = updatedTeams.filter((t) => t.id !== finalCode && newGroupOf[t.id] === minGroup);
        const groupList = [...((c.groupFixtures && c.groupFixtures[minGroup]) || [])];
        let gSeq = groupList.length + 1;
        const referees = (c.referees && c.referees.length > 0) ? c.referees : ['Ref Kamau', 'Ref Otieno'];

        groupOpponents.forEach((opp) => {
          const ref = referees[gSeq % referees.length];
          const gfObj = {
            id: `GF-${minGroup}-${gSeq}`,
            date: 'Upcoming Weekend · 16:00',
            venue: 'Thoome Pri.',
            home: finalCode,
            away: opp.id,
            played: false,
            walkover: null,
            referee: ref,
            events: [],
          };
          groupList.push(gfObj);
          updatedFixtures.push(gfObj);
          gSeq++;
          newMatchesCount++;
        });

        const newGroupFixtures = { ...(c.groupFixtures || {}), [minGroup]: groupList };
        resultSummary = {
          teamId: finalCode,
          teamName: name,
          playerCount: newPlayers.filter((p) => !p.unknown).length,
          fixtureCount: newMatchesCount,
        };
        return {
          ...c,
          teams: updatedTeams,
          groupOf: newGroupOf,
          groupFixtures: newGroupFixtures,
          fixtures: updatedFixtures,
        };
      }

      if (generateFixtures !== false) {
        const otherTeams = updatedTeams.filter((t) => t.id !== finalCode);
        const format = fixtureFormat || c.format || 'double';
        const referees = (c.referees && c.referees.length > 0)
          ? c.referees
          : ['Ref Kamau', 'Ref Otieno', 'Ref Njoroge'];

        let maxSeq = 0;
        let idPrefix = 'REAL-F';
        (c.fixtures || []).forEach((f) => {
          const mReal = String(f.id || '').match(/REAL-F(\d+)/i);
          if (mReal) {
            idPrefix = 'REAL-F';
            const num = parseInt(mReal[1], 10);
            if (num > maxSeq) maxSeq = num;
          } else {
            const mF = String(f.id || '').match(/^F(\d+)$/i);
            if (mF) {
              const num = parseInt(mF[1], 10);
              if (num > maxSeq) maxSeq = num;
            }
          }
        });

        // Determine home & away or single pairings
        const newPairs = [];
        otherTeams.forEach((opp) => {
          newPairs.push({ home: finalCode, away: opp.id });
          if (format === 'double') {
            newPairs.push({ home: opp.id, away: finalCode });
          }
        });

        const newUnplayedFixtures = newPairs.map((pair) => ({
          home: pair.home,
          away: pair.away,
          played: false,
          walkover: null,
          events: [],
        }));

        newMatchesCount = newUnplayedFixtures.length;

        // Reorganize all unplayed fixtures so catch-up matches play first,
        // and no team plays an extra game before the new team has played!
        updatedFixtures = reorganizeLeagueUnplayedFixtures(
          {
            ...c,
            teams: updatedTeams,
            fixtures: [...(c.fixtures || []), ...newUnplayedFixtures],
          },
          finalCode
        );
      }

      resultSummary = {
        teamId: finalCode,
        teamName: name,
        playerCount: newPlayers.filter((p) => !p.unknown).length,
        fixtureCount: newMatchesCount,
      };

      return {
        ...c,
        teams: updatedTeams,
        fixtures: updatedFixtures,
      };
    });

    return resultSummary;
  };

  const handleReorganizeUnplayedFixtures = (catKey = activeCategoryKey) => {
    let reorderedCount = 0;
    updateActiveCategory((c) => {
      if (!c || c.mode === 'cup') return c;
      const reordered = reorganizeLeagueUnplayedFixtures(c);
      const playedCount = (c.fixtures || []).filter((f) => f.played || (f.events && f.events.length > 0) || f.walkover || (f.score1 != null && f.score2 != null)).length;
      reorderedCount = reordered.length - playedCount;
      return {
        ...c,
        fixtures: reordered,
      };
    });
    return reorderedCount;
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
  const handleCmsLoginSuccess = async (cms) => {
    // Single-session mutual exclusivity: log off player if manager signs in
    setPlayerUser(null);
    api.setPlayerToken('');
    setCmsUser(cms);
    setIsCmsMode(true);
    setCurrentView('manage');

    // Automatically flush any pending unsaved state now that manager is authenticated!
    try {
      const rawPending = localStorage.getItem('ruiru_titans_pending_sync');
      if (rawPending) {
        const pendingState = JSON.parse(rawPending);
        if (pendingState && pendingState.categories) {
          setSyncStatus('saving');
          await api.saveState(pendingState);
          setData(pendingState);
          localStorage.removeItem('ruiru_titans_pending_sync');
          setSyncStatus('synced');
        }
      }
    } catch (e) {
      console.warn('Could not flush pending sync on CMS login:', e);
    }
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
      <div style={{ minHeight: '100vh', background: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#8E8E93' }}>
          <img src={(typeof window !== 'undefined' && window.CLUB_LOGO_URL) || '/club-logo.jpg'} alt="Ruiru Titans" style={{ width: '64px', height: '64px', marginBottom: '16px', objectFit: 'contain' }} />
          <div style={{ color: '#FFFFFF', fontWeight: 600 }}>Loading Ruiru Titans Official Club Homepage…</div>
        </div>
      </div>
    );
  }

  const isAdmin = Boolean(cmsUser);
  const isLoggedIn = Boolean(playerUser || cmsUser);

  const navTabs = [
    { key: 'home', label: '🏠 Home' },
    { key: 'championship', label: '🏆 Championship' },
    { key: 'table', label: '📊 League Table' },
    { key: 'fixtures', label: '⚽ Results & Fixtures' },
    { key: 'cup', label: '🏆 Cup Progression' },
    { key: 'highlights', label: '🎥 Highlights' },
    { key: 'archives', label: '🏛️ Archives' },
    ...(isLoggedIn ? [{ key: 'voting', label: '⭐ TOTW & TOTT (Vote)' }] : []),
    { key: 'stats', label: '📈 Player Stats' },
    ...(isAdmin ? [{ key: 'balancer', label: '⚖️ Team Balancer' }] : []),
    ...(isAdmin ? [{ key: 'tactics', label: '📋 Tactics' }] : []),
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

  const isDedicatedTacticsMode = isStandaloneTactics && currentView === 'tactics';

  return (
    <div style={{ minHeight: '100vh', background: '#000000', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar with Sign In to Manager Dashboard Link & Player Auth OR Dedicated Tactics Header */}
      {!isDedicatedTacticsMode ? (
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
      ) : (
        <header
          style={{
            background: '#121212',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '10px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={() => handleToggleStandaloneTactics(false)}
              style={{
                background: '#1C1C1E',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
              title="Return to the main Ruiru Titans club portal"
            >
              <span>←</span>
              <span>Back to Club Portal</span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>📋</span>
              <span className="scoreboard" style={{ fontSize: '18px', color: '#FF9F0A', letterSpacing: '0.04em' }}>
                RUIRU TITANS · DEDICATED TACTICS BOARD
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => window.open(window.location.pathname + '?tactics_standalone=true', '_blank')}
              style={{
                background: '#000000',
                color: '#8E8E93',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="Open in a separate standalone browser window"
            >
              <span>↗</span> Open in New Window
            </button>
            <button
              type="button"
              onClick={() => handleToggleStandaloneTactics(false)}
              style={{
                background: '#231518',
                color: '#FF8A8A',
                border: '1px solid #732228',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
              title="Exit dedicated board page and restore all club portal sections"
            >
              ✕ Exit Dedicated Page
            </button>
          </div>
        </header>
      )}

      {/* Main Content Container */}
      <main
        style={{
          maxWidth: isDedicatedTacticsMode ? '1440px' : '1180px',
          width: '100%',
          margin: '0 auto',
          padding: isDedicatedTacticsMode ? '10px 14px 48px' : '20px 16px 64px',
          flex: 1,
        }}
      >
        {/* STUNNING HERO BANNER (Hidden on dedicated tactics board page) */}
        {!isDedicatedTacticsMode && (
          <section
            className="hero-banner"
            style={{
              background: 'radial-gradient(circle at 85% 20%, rgba(255, 149, 0, 0.22) 0%, rgba(15, 46, 36, 0.96) 55%, #000000 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
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
                  background: '#000000',
                  border: '2px solid #FF9500',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(255, 149, 0, 0.25)',
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
                      background: 'rgba(255, 149, 0, 0.18)',
                      border: '1px solid rgba(255, 149, 0, 0.45)',
                      color: '#FF9500',
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
                    color: '#FFFFFF',
                    fontSize: 'clamp(32px, 5vw, 48px)',
                    margin: '2px 0 4px',
                    lineHeight: 0.98,
                    letterSpacing: '0.04em',
                  }}
                >
                  RUIRU TITANS FOOTBALL CLUB
                </h1>

                <p style={{ color: '#8E8E93', fontSize: '13px', margin: 0, maxWidth: '580px', lineHeight: 1.5 }}>
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
                          background: '#FF9500',
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
                          boxShadow: '0 4px 16px rgba(255, 149, 0, 0.3)',
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
                          background: 'rgba(255, 149, 0, 0.16)',
                          border: '1px solid #FF9500',
                          color: '#FFFFFF',
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
                        background: '#FF9500',
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
                        boxShadow: '0 4px 16px rgba(255, 149, 0, 0.3)',
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
                      background: currentView === 'player-dashboard' ? '#FF9500' : '#1C1C1E',
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
                      background: 'rgba(255, 149, 0, 0.15)',
                      color: '#FF9500',
                      border: '1px solid #FF9500',
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
                    background: '#1C1C1E',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
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
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '20px' }}>{stat.icon}</span>
                <div>
                  <div style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {stat.label}
                  </div>
                  <div className="scoreboard" style={{ fontSize: '21px', color: '#FFFFFF', lineHeight: 1.1 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: '10px', color: '#8E8E93' }}>{stat.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
        )}

        {/* Manager Dashboard Active Banner */}
        {!isDedicatedTacticsMode && isCmsMode && (
          <div
            style={{
              background: 'rgba(255, 149, 0, 0.14)',
              border: '1px solid #FF9500',
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
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Manager Dashboard Active ({cmsUser?.username || 'Manager'})
                </div>
                <div style={{ fontSize: '11.5px', color: '#EBEBF5' }}>
                  You can now edit match events, mark fixtures final, assign referees, manage teams/players, and control voting windows across all categories.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {activeCompetitionsList.map(([k, c]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleSelectActiveCategory(k)}
                  style={{
                    background: k === activeCategoryKey ? '#FF9500' : '#1C1C1E',
                    color: k === activeCategoryKey ? '#16201B' : '#EBEBF5',
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
                onClick={() => setEditingCategoryKey(activeCategoryKey)}
                title={`Edit "${cat?.label}" name, start date, referees & rules`}
                style={{
                  background: '#000000',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#6CE5A0',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '4px 10px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                ✏️ Edit &ldquo;{cat?.label}&rdquo;
              </button>
              <button
                type="button"
                onClick={() => setAddingCategory(!addingCategory)}
                style={{
                  background: 'transparent',
                  border: '1px dashed #FF9500',
                  color: '#FF9500',
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
        {!isDedicatedTacticsMode && isCmsMode && addingCategory && (
          <form
            onSubmit={handleCreateCategory}
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '16px',
              background: '#121212',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
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
            <input
              type="date"
              className="form-input"
              style={{ width: '150px' }}
              value={newCatStartDate}
              onChange={(e) => setNewCatStartDate(e.target.value)}
              title="Tournament Kickoff / Start Date (optional)"
            />
            <button type="submit" className="stat-btn" style={{ background: '#FF9500', color: '#16201B', fontWeight: 800, padding: '8px 18px' }}>
              Create Category
            </button>
          </form>
        )}

        {/* Primary Section Navigation Bar (Fixed / Sticky on Scroll) */}
        {!isDedicatedTacticsMode && (
          <nav
            aria-label="Club Homepage Sections"
            className="club-section-navbar"
            onWheel={(e) => {
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
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
                  background: currentView === t.key ? '#FF9500' : 'transparent',
                  color: currentView === t.key ? '#16201B' : '#8E8E93',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        {/* Voting Notice Banner: Shows non-logged in users that voting requires logging in */}
        {!isDedicatedTacticsMode && !playerUser && !cmsUser && (
          <div
            style={{
              background: 'rgba(255, 149, 0, 0.08)',
              border: '1px solid rgba(255, 149, 0, 0.28)',
              borderRadius: '12px',
              padding: '10px 16px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🗳️</span>
              <span style={{ fontSize: '12.5px', color: '#EBEBF5' }}>
                <strong style={{ color: '#FF9500' }}>Official Titans Voting:</strong> You should be logged in to cast your vote for Team of the Week (TOTW) and Team of the Tournament (TOTT).
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAuthModal({ open: true, tab: 'player' })}
              style={{
                background: '#FF9500',
                color: '#16201B',
                border: 'none',
                borderRadius: '999px',
                padding: '6px 14px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ⚽ Sign In to Vote
            </button>
          </div>
        )}

        {/* Public Active Competition Switcher Bar (for Fixtures, Voting, Standings, Cup, Stats & Balancer) */}
        {!isDedicatedTacticsMode && currentView !== 'home' && currentView !== 'tactics' && activeCompetitionsList.length > 0 && (
          <div
            style={{
              background: '#121212',
              border: '1px solid rgba(255, 255, 255, 0.1)',
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
                  color: '#8E8E93',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}
              >
                🏆 Active Competition:
              </span>
              {activeCompetitionsList.map(([k, c]) => {
                const isActive = k === activeCategoryKey;
                const isCup = c.mode === 'cup';
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleSelectActiveCategory(k)}
                    style={{
                      background: isActive ? '#FF9500' : '#1C1C1E',
                      color: isActive ? '#16201B' : '#EBEBF5',
                      border: isActive ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
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
                  background: '#000000',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
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
                  <h2 className="scoreboard" style={{ margin: 0, fontSize: '24px', color: '#FFFFFF', letterSpacing: '0.04em' }}>
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
                <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '14px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#4ADE80', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        ✅ Latest Match Results
                      </span>
                      <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                        Completed Ruiru Titans League matches
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn-pill-action"
                        style={{
                          background: 'linear-gradient(135deg, #104332 0%, #17543E 100%)',
                          border: '1px solid #2EE59D',
                          color: '#E8FFF3',
                          fontWeight: 800,
                          boxShadow: '0 2px 8px rgba(46, 229, 157, 0.25)',
                        }}
                        onClick={() => setAppShowAIReport(true)}
                        title="Open AI Weekly & Matchweek Report Generator"
                      >
                        🤖 AI Weekly Report
                      </button>
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
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {clubMetrics.recentResults.map((f) => {
                      const home = leagueTeamsById[f.home];
                      const away = leagueTeamsById[f.away];
                      const { hs, as } = computeFixtureScore(f);
                      const hasReport = Boolean(f.report?.content && f.report.content.trim());
                      return (
                        <div
                          key={f.id}
                          style={{
                            background: '#121212',
                            border: '1px solid #1C1C1E',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}
                        >
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: home?.color || '#FF9500' }} />
                            {f.home ? (
                              <button
                                type="button"
                                className="team-link-btn"
                                onClick={() => handleOpenTeamDetails(f.home, leagueCategoryKey)}
                                style={{ fontWeight: 700, fontSize: '13px', color: '#FFFFFF' }}
                                title={`Click to view ${home?.name || f.home} profile & odds`}
                              >
                                {home?.name || f.home}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#FFFFFF' }}>{home?.name || f.home}</span>
                            )}
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <span
                              className="scoreboard"
                              style={{
                                fontSize: '20px',
                                color: '#FF9500',
                                background: '#121212',
                                padding: '2px 10px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              {hs} - {as}
                            </span>
                            <div style={{ fontSize: '9.5px', color: '#8E8E93', marginTop: '2px' }}>{f.date}</div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', textAlign: 'right' }}>
                            {f.away ? (
                              <button
                                type="button"
                                className="team-link-btn"
                                onClick={() => handleOpenTeamDetails(f.away, leagueCategoryKey)}
                                style={{ fontWeight: 700, fontSize: '13px', color: '#FFFFFF' }}
                                title={`Click to view ${away?.name || f.away} profile & odds`}
                              >
                                {away?.name || f.away}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#FFFFFF' }}>{away?.name || f.away}</span>
                            )}
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: away?.color || '#2E5A8F' }} />
                          </div>
                          <button
                            type="button"
                            onClick={() => setAppReportFixture(f)}
                            style={{
                              background: hasReport ? 'rgba(46, 229, 157, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                              border: hasReport ? '1px solid #2EE59D' : '1px solid #335544',
                              color: hasReport ? '#A7F3D0' : '#8E8E93',
                              padding: '5px 9px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                            title={hasReport ? 'Read Official Match Report' : (isCmsMode ? 'Write Official Match Report' : 'Match Report')}
                          >
                            {hasReport ? '📄 Report' : (isCmsMode ? '✍️ Add Report' : '📄 Report')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Upcoming Fixtures Card */}
                <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '14px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        📅 Upcoming League Fixtures
                      </span>
                      <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                        Next scheduled matchdays at Thoome Pri.
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
                            background: '#121212',
                            border: '1px dashed rgba(255, 255, 255, 0.1)',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}
                        >
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: home?.color || '#FF9500' }} />
                            {f.home ? (
                              <button
                                type="button"
                                className="team-link-btn"
                                onClick={() => handleOpenTeamDetails(f.home, leagueCategoryKey)}
                                style={{ fontWeight: 700, fontSize: '13px', color: '#FFFFFF' }}
                                title={`Click to view ${home?.name || f.home} profile & odds`}
                              >
                                {home?.name || f.home}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#FFFFFF' }}>{home?.name || f.home}</span>
                            )}
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <span
                              className="scoreboard"
                              style={{
                                fontSize: '16px',
                                color: '#8E8E93',
                                background: '#121212',
                                padding: '2px 10px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              VS
                            </span>
                            <div style={{ fontSize: '9.5px', color: '#FF9500', marginTop: '2px', fontWeight: 600 }}>{f.date}</div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', textAlign: 'right' }}>
                            {f.away ? (
                              <button
                                type="button"
                                className="team-link-btn"
                                onClick={() => handleOpenTeamDetails(f.away, leagueCategoryKey)}
                                style={{ fontWeight: 700, fontSize: '13px', color: '#FFFFFF' }}
                                title={`Click to view ${away?.name || f.away} profile & odds`}
                              >
                                {away?.name || f.away}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#FFFFFF' }}>{away?.name || f.away}</span>
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
                  <h2 className="scoreboard" style={{ margin: 0, fontSize: '26px', color: '#FFFFFF', letterSpacing: '0.04em' }}>
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
                <h2 className="scoreboard" style={{ margin: 0, fontSize: '26px', color: '#FFFFFF', letterSpacing: '0.04em' }}>
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
                    style={{ background: '#FF9500', color: '#16201B', borderColor: '#FF9500', fontWeight: 800 }}
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
            isCmsMode={isCmsMode}
            onOpenEditCategory={() => setEditingCategoryKey(leagueCategoryKey)}
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
            activeCategoryKey={effectiveCategoryKey}
            categoryLabel={cat?.label}
            isCmsMode={isCmsMode}
            cmsUser={cmsUser}
            initialFilter={fixturesInitialFilter}
            onTogglePlayed={(fId) => handleTogglePlayed(fId, effectiveCategoryKey)}
            onAddEvent={(fId, ev) => handleAddEvent(fId, ev, effectiveCategoryKey)}
            onRemoveEvent={(fId, idx) => handleRemoveEvent(fId, idx, effectiveCategoryKey)}
            onSetWalkover={(fId, wId) => handleSetWalkover(fId, wId, effectiveCategoryKey)}
            onSetReferee={(fId, ref) => handleSetReferee(fId, ref, effectiveCategoryKey)}
            onAddReferee={(refName) => handleAddReferee(refName, effectiveCategoryKey)}
            onRemoveReferee={(refName) => handleRemoveReferee(refName, effectiveCategoryKey)}
            onRandomizeReferees={() => handleRandomizeReferees(effectiveCategoryKey)}
            onUpdateSchedule={(s, apply) => handleUpdateSchedule(effectiveCategoryKey, s, apply)}
            onMoveFixture={(fId, newDateStr) => handleMoveFixtureDate(effectiveCategoryKey, fId, newDateStr)}
            onBatchMoveFixtures={(map) => handleBatchMoveFixtures(effectiveCategoryKey, map)}
            onOpenH2H={(t1, t2) => handleOpenH2H(t1, t2, effectiveCategoryKey)}
            onGenerateFixtures={handleGenerateFixtures}
            onReorganizeUnplayedFixtures={() => handleReorganizeUnplayedFixtures(effectiveCategoryKey)}
            onOpenEditCategory={() => setEditingCategoryKey(effectiveCategoryKey)}
            onSelectTeam={handleOpenTeamDetails}
            onReportSaved={(fId, reportData) => handleSaveFixtureReport(fId, reportData, effectiveCategoryKey)}
            onAddPlayers={handleAddPlayers}
          />
        )}

        {/* =========================================================
            4. DEDICATED CUP PROGRESSION LEVELS & FIXTURES VIEW
           ========================================================= */}
        {currentView === 'cup' && (
          <CupProgressionView
            cupCategory={cupCat}
            cupCategoryKey={cupCategoryKey}
            cupCategoriesList={Object.entries(data.categories)
              .filter(([, c]) => c.mode === 'cup' && !c.isEnded && !c.isDeleted)
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
            onOpenEditCategory={() => setEditingCategoryKey(cupCat ? cupCategoryKey : activeCategoryKey)}
            onSelectTeam={handleOpenTeamDetails}
          />
        )}

        {/* =========================================================
            5. DEDICATED TOTW, TOTT & PLAYER VOTING VIEW
           ========================================================= */}
        {currentView === 'voting' && (
          !playerUser && !cmsUser ? (
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 149, 0, 0.35)',
                borderRadius: '16px',
                padding: '44px 24px',
                textAlign: 'center',
                maxWidth: '640px',
                margin: '40px auto',
              }}
            >
              <div style={{ fontSize: '42px', marginBottom: '14px' }}>⭐</div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
                OFFICIAL TITANS BALLOT
              </div>
              <h3 className="scoreboard" style={{ fontSize: '26px', color: '#FFFFFF', margin: '0 0 10px' }}>
                YOU SHOULD BE LOGGED IN TO VOTE
              </h3>
              <p style={{ fontSize: '13.5px', color: '#8E8E93', maxWidth: '480px', margin: '0 auto 20px', lineHeight: 1.6 }}>
                Official voting for Team of the Week (TOTW) and Team of the Tournament (TOTT) is reserved for registered Ruiru Titans players and team managers. Please sign in to submit your ballot.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setAuthModal({ open: true, tab: 'player' })}
                  style={{
                    background: '#FF9500',
                    color: '#16201B',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(255, 149, 0, 0.3)',
                  }}
                >
                  ⚽ Sign In as Player to Vote
                </button>
                <button
                  type="button"
                  onClick={() => setAuthModal({ open: true, tab: 'cms' })}
                  style={{
                    background: '#1C1C1E',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🔐 Manager Sign-In
                </button>
              </div>
            </div>
          ) : (
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
          )
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
          !cmsUser ? (
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '44px 24px',
                textAlign: 'center',
                maxWidth: '640px',
                margin: '40px auto',
              }}
            >
              <div style={{ fontSize: '42px', marginBottom: '14px' }}>⚖️</div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
                ADMIN TOOL RESTRICTED
              </div>
              <h3 className="scoreboard" style={{ fontSize: '26px', color: '#FFFFFF', margin: '0 0 10px' }}>
                ADMIN ACCESS REQUIRED
              </h3>
              <p style={{ fontSize: '13.5px', color: '#8E8E93', maxWidth: '480px', margin: '0 auto 20px', lineHeight: 1.6 }}>
                The Team Balancer is reserved exclusively for tournament managers and club administrators. Please sign in with your manager credentials to access this tool.
              </p>
              <button
                type="button"
                onClick={() => setAuthModal({ open: true, tab: 'cms' })}
                style={{
                  background: '#FF9500',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(255, 149, 0, 0.3)',
                }}
              >
                🔐 Sign In as Manager
              </button>
            </div>
          ) : (
            <TeamBalancerView
              categories={data.categories}
              activeCategoryKey={activeCategoryKey}
              activeCategoryLabel={cat?.label || 'Open League'}
              onApplyBalancedTeamsToCategory={handleApplyBalancedTeamsToCategory}
              onCreateCategoryWithBalancedTeams={handleCreateCategoryWithBalancedTeams}
              onNavigateToCompetitionView={handleNavigateToCompetitionView}
            />
          )
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
            6F. DEDICATED TACTICS & FORMATIONS BOARD VIEW
           ========================================================= */}
        {currentView === 'tactics' && (
          !cmsUser ? (
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '44px 24px',
                textAlign: 'center',
                maxWidth: '640px',
                margin: '40px auto',
              }}
            >
              <div style={{ fontSize: '42px', marginBottom: '14px' }}>📋</div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
                ADMIN TOOL RESTRICTED
              </div>
              <h3 className="scoreboard" style={{ fontSize: '26px', color: '#FFFFFF', margin: '0 0 10px' }}>
                ADMIN ACCESS REQUIRED
              </h3>
              <p style={{ fontSize: '13.5px', color: '#8E8E93', maxWidth: '480px', margin: '0 auto 20px', lineHeight: 1.6 }}>
                Tactics, chalkboard lineups, and formations are reserved exclusively for tournament managers and club administrators. Please sign in with your manager credentials to access tactics.
              </p>
              <button
                type="button"
                onClick={() => setAuthModal({ open: true, tab: 'cms' })}
                style={{
                  background: '#FF9500',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(255, 149, 0, 0.3)',
                }}
              >
                🔐 Sign In as Manager
              </button>
            </div>
          ) : (
            <TacticsView
              categories={data.categories}
              activeCategoryKey={activeCategoryKey}
              isCmsMode={isCmsMode}
              isStandalonePage={isDedicatedTacticsMode}
              onToggleStandalonePage={handleToggleStandaloneTactics}
            />
          )
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
                background: '#121212',
                border: '1px solid #3F7A4E',
                borderRadius: '14px',
                padding: '36px 24px',
                textAlign: 'center',
              }}
            >
              <h3 className="scoreboard" style={{ fontSize: '28px', color: '#FFFFFF', margin: '0 0 8px' }}>
                👤 PLAYER DASHBOARD SIGN-IN REQUIRED
              </h3>
              <p style={{ fontSize: '13px', color: '#8E8E93', maxWidth: '460px', margin: '0 auto 16px' }}>
                Please sign in with your player username and password (or activation code) to view your season statistics, upcoming matchdays, official discipline status, and voting ballot.
              </p>
              <button
                type="button"
                onClick={() => setAuthModal({ open: true, tab: 'player' })}
                style={{
                  background: '#6CE5A0',
                  color: '#000000',
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
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                padding: '36px 24px',
                textAlign: 'center',
              }}
            >
              <h3 className="scoreboard" style={{ fontSize: '24px', color: '#FFFFFF', margin: '0 0 8px' }}>
                👤 SIGNED IN AS PLAYER ({playerUser.name})
              </h3>
              <p style={{ fontSize: '13px', color: '#8E8E93', maxWidth: '520px', margin: '0 auto 16px' }}>
                Manager Dashboard is reserved for tournament managers and staff. As a signed-in player, you have access to your personalized Player Dashboard, match results, and TOTW/TOTT ballots.
              </p>
              <button
                type="button"
                onClick={() => setCurrentView('player-dashboard')}
                style={{
                  background: '#6CE5A0',
                  color: '#000000',
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
              onCreateLeagueTeam={handleCreateLeagueTeam}
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
              onReorganizeUnplayedFixtures={handleReorganizeUnplayedFixtures}
              onApplyBalancedTeamsToCategory={handleApplyBalancedTeamsToCategory}
              onCreateCategoryWithBalancedTeams={handleCreateCategoryWithBalancedTeams}
              onNavigateToCompetitionView={handleNavigateToCompetitionView}
              onMovePlayer={handleMovePlayer}
              onIntelligentlyAddPlayer={handleIntelligentlyAddPlayerToCategory}
              onOpenEditCategory={() => setEditingCategoryKey(activeCategoryKey)}
              onSelectTeam={handleOpenTeamDetails}
              initialSection={manageSection}
            />
          ) : (
            <div
              style={{
                background: '#121212',
                border: '1px solid #FF9500',
                borderRadius: '14px',
                padding: '36px 24px',
                textAlign: 'center',
              }}
            >
              <h3 className="scoreboard" style={{ fontSize: '28px', color: '#FFFFFF', margin: '0 0 8px' }}>
                🔐 MANAGER DASHBOARD SIGN-IN REQUIRED
              </h3>
              <p style={{ fontSize: '13px', color: '#8E8E93', maxWidth: '520px', margin: '0 auto 16px' }}>
                Please sign in with your Ruiru Titans manager credentials to access the <strong>📝 Player Registration Form</strong> (with 4-digit code generation), reset player passwords by username, and manage teams and tournament fixtures.
              </p>
              <button
                type="button"
                onClick={() => setAuthModal({ open: true, tab: 'cms' })}
                style={{
                  background: '#FF9500',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🔐 Open Manager Sign-In
              </button>
            </div>
          )
        )}
      </main>

      {/* Club Footer with Manager Dashboard Sign-In Link */}
      <footer
        style={{
          background: '#000000',
          borderTop: '1px solid #1C1C1E',
          padding: '24px 20px',
          color: '#8E8E93',
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
              <strong style={{ color: '#FFFFFF' }}>Ruiru Titans Football Club</strong> · 2026 Season Official Portal
              <div style={{ fontSize: '11px', color: '#8E8E93' }}>
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
                  color: '#FF9500',
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
          isCmsMode={isCmsMode}
          onMovePlayer={handleMovePlayer}
          onAddPlayers={(tId, names, pos, u, p) => handleAddPlayers(tId, names, pos, u, p, teamModalState.categoryKey || activeCategoryKey)}
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

      {/* Edit League / Category Modal */}
      {editingCategoryKey && data.categories[editingCategoryKey] && (
        <EditCategoryModal
          isOpen={Boolean(editingCategoryKey)}
          categoryKey={editingCategoryKey}
          category={data.categories[editingCategoryKey]}
          onClose={() => setEditingCategoryKey(null)}
          onSaveCategory={handleSaveCategorySettings}
          onDeleteCategory={handleDeleteCategory}
        />
      )}

      {/* Match Report Modal (from Championship Home View) */}
      {appReportFixture && (
        <MatchReportModal
          fixture={appReportFixture}
          homeTeam={leagueTeamsById[appReportFixture.home] || (data.categories[leagueCategoryKey]?.teams || []).find((t) => t.id === appReportFixture.home)}
          awayTeam={leagueTeamsById[appReportFixture.away] || (data.categories[leagueCategoryKey]?.teams || []).find((t) => t.id === appReportFixture.away)}
          categoryKey={leagueCategoryKey}
          isCmsMode={isCmsMode}
          cmsUser={cmsUser}
          onClose={() => setAppReportFixture(null)}
          onReportSaved={(fId, rep) => {
            handleSaveFixtureReport(fId, rep, leagueCategoryKey);
            setAppReportFixture((prev) => (prev && prev.id === fId ? { ...prev, report: rep } : prev));
          }}
        />
      )}

      {/* AI Weekly Report Generator Modal (from Championship Home View) */}
      {appShowAIReport && (
        <AIWeeklyReportModal
          categoryKey={leagueCategoryKey}
          categoryLabel={data.categories[leagueCategoryKey]?.label || 'Ruiru Titans League'}
          fixtures={data.categories[leagueCategoryKey]?.fixtures || []}
          teamsById={leagueTeamsById}
          onClose={() => setAppShowAIReport(false)}
        />
      )}
    </div>
  );
}
