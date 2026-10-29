import React, { useState, useMemo, useEffect } from 'react';
import { formatDateWithTime, parseDaysConfig } from './FixturesView';
import { openCategoryFixturesResultsPDF } from '../utils/pdfExport';

function computeFixtureScore(matchLike, homeId, awayId) {
  if (!matchLike) return { hs: 0, as: 0 };
  if (matchLike.walkover) {
    return {
      hs: matchLike.walkover === homeId ? 3 : 0,
      as: matchLike.walkover === awayId ? 3 : 0,
    };
  }
  let hs = 0;
  let as = 0;
  (matchLike.events || []).forEach((e) => {
    if (e.type === 'goal' && e.teamId === homeId) hs++;
    else if (e.type === 'goal' && e.teamId === awayId) as++;
    else if (e.type === 'owngoal' && e.teamId === homeId) as++;
    else if (e.type === 'owngoal' && e.teamId === awayId) hs++;
  });
  return { hs, as };
}

function getTieResult(tie) {
  if (!tie || !tie.match || !tie.match.played) return null;
  const { hs, as } = computeFixtureScore(tie.match, tie.home, tie.away);
  if (hs > as) return { winner: tie.home, hs, as, onPens: false };
  if (as > hs) return { winner: tie.away, hs, as, onPens: false };
  const ph = tie.pen?.h !== '' && tie.pen?.h != null ? Number(tie.pen.h) : null;
  const pa = tie.pen?.a !== '' && tie.pen?.a != null ? Number(tie.pen.a) : null;
  if (ph !== null && pa !== null && ph !== pa) {
    return { winner: ph > pa ? tie.home : tie.away, hs, as, onPens: true, ph, pa };
  }
  return { winner: null, hs, as, tied: true };
}

function getRoundLabel(roundIdx, totalRounds) {
  const fromEnd = totalRounds - 1 - roundIdx;
  const labels = ['Grand Final', 'Semi-Finals', 'Quarter-Finals', 'Round of 16', 'Round of 32'];
  return labels[fromEnd] || `Knockout Round ${roundIdx + 1}`;
}

function computeGroupStandings(teams, fixtures) {
  const table = {};
  (teams || []).forEach((t) => {
    table[t.id] = { id: t.id, name: t.name, color: t.color, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
  });
  (fixtures || []).forEach((f) => {
    const isPlayed = Boolean(f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0));
    if (!isPlayed) return;
    const { hs, as } = computeFixtureScore(f, f.home, f.away);
    const h = table[f.home];
    const a = table[f.away];
    if (!h || !a) return;
    h.P++;
    a.P++;
    h.GF += hs;
    h.GA += as;
    a.GF += as;
    a.GA += hs;
    if (hs > as) {
      h.W++;
      h.Pts += 3;
      a.L++;
    } else if (hs < as) {
      a.W++;
      a.Pts += 3;
      h.L++;
    } else {
      h.D++;
      a.D++;
      h.Pts += 1;
      a.Pts += 1;
    }
  });
  const rows = Object.values(table);
  rows.forEach((r) => {
    r.GD = r.GF - r.GA;
  });
  return rows.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF);
}

export default function CupProgressionView({
  cupCategory,
  cupCategoryKey,
  cupCategoriesList = [],
  onSelectCupCategory,
  isCmsMode = false,
  suspensions = {},
  schedule,
  onUpdateSchedule,
  onUpdateCupCategory,
  onOpenH2H,
  onMoveFixture,
  onBatchMoveFixtures,
  onSelectTeam,
}) {
  const [selectedLevel, setSelectedLevel] = useState('all'); // 'all' | 'groups' | 'round-0' | 'round-1' | ...
  const [fixtureFilter, setFixtureFilter] = useState('all'); // 'all' | 'results' | 'upcoming'
  const [openEditorIds, setOpenEditorIds] = useState({});
  const [newCupRefInput, setNewCupRefInput] = useState('');

  // Draft states for goal recording in Cup knockout and group matches
  const [goalDrafts, setGoalDrafts] = useState({});
  const [interfDrafts, setInterfDrafts] = useState({});

  // Tournament Scheduling Configuration state for Cup
  const [scheduleTime, setScheduleTime] = useState(schedule?.time || '15:00');
  const [scheduleStartDate, setScheduleStartDate] = useState(
    schedule?.startDate || schedule?.start_date || ''
  );
  const [daysConfig, setDaysConfig] = useState(() =>
    parseDaysConfig(
      schedule?.days,
      schedule?.time || '15:00',
      schedule?.matches_per_day || schedule?.fixtures_per_day || 1
    )
  );
  const [fixturesPerDay, setFixturesPerDay] = useState(
    schedule?.matches_per_day || schedule?.fixtures_per_day || 1
  );
  const [showScheduleConfig, setShowScheduleConfig] = useState(false);

  // Single fixture moving state
  const [movingFixtureId, setMovingFixtureId] = useState(null);
  const [moveDateInput, setMoveDateInput] = useState('');
  const [moveTimeInput, setMoveTimeInput] = useState('15:00');

  // Bulk move state
  const [showBulkMoveTool, setShowBulkMoveTool] = useState(false);
  const [selectedForMove, setSelectedForMove] = useState({}); // { [fId]: boolean }
  const [bulkMoveDate, setBulkMoveDate] = useState('');
  const [bulkMoveTime, setBulkMoveTime] = useState('15:00');
  const [bulkSpaceOneHour, setBulkSpaceOneHour] = useState(true);

  useEffect(() => {
    if (schedule?.time) setScheduleTime(schedule.time);
    if (schedule?.startDate || schedule?.start_date) {
      setScheduleStartDate(schedule.startDate || schedule.start_date);
    }
    if (schedule?.days) {
      setDaysConfig(
        parseDaysConfig(
          schedule.days,
          schedule.time || '15:00',
          schedule.matches_per_day || schedule.fixtures_per_day || 1
        )
      );
    }
    if (schedule?.matches_per_day || schedule?.fixtures_per_day) {
      setFixturesPerDay(schedule.matches_per_day || schedule.fixtures_per_day);
    }
  }, [schedule]);

  const teamsById = useMemo(() => {
    const map = {};
    (cupCategory?.teams || []).forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [cupCategory]);

  const allTeamsList = Object.values(teamsById);

  const groupLetters = cupCategory?.groupLetters || [];
  const groupOf = cupCategory?.groupOf || {};
  const groupFixtures = cupCategory?.groupFixtures || {};
  const rounds = cupCategory?.rounds || [];
  const referees = cupCategory?.referees || [];

  const handleToggleScheduleDay = (dayNum) => {
    setDaysConfig((prev) => ({
      ...prev,
      [dayNum]: {
        ...(prev[dayNum] || { matches: 1, time: scheduleTime }),
        enabled: !prev[dayNum]?.enabled,
      },
    }));
  };

  const handleUpdateDayMatches = (dayNum, matchesVal) => {
    const val = Math.max(1, parseInt(matchesVal, 10) || 1);
    setDaysConfig((prev) => ({
      ...prev,
      [dayNum]: {
        ...(prev[dayNum] || { enabled: true, time: scheduleTime }),
        matches: val,
      },
    }));
  };

  const handleUpdateDayTime = (dayNum, timeVal) => {
    setDaysConfig((prev) => ({
      ...prev,
      [dayNum]: {
        ...(prev[dayNum] || { enabled: true, matches: 1 }),
        time: timeVal || scheduleTime,
      },
    }));
  };

  const handleSaveSchedule = (applyToUnplayed = false) => {
    if (!onUpdateSchedule) return;
    const maxMatches = Math.max(1, ...Object.values(daysConfig).map((c) => (c.enabled ? c.matches : 1)));
    const primaryTime = Object.values(daysConfig).find((c) => c.enabled)?.time || scheduleTime || '15:00';
    const newSchedule = {
      time: primaryTime,
      days: daysConfig,
      matches_per_day: maxMatches,
      startDate: scheduleStartDate,
      start_date: scheduleStartDate,
    };
    onUpdateSchedule(newSchedule, applyToUnplayed);
  };

  const handleConfirmSingleMove = (fixtureId) => {
    if (!moveDateInput || !onMoveFixture) return;
    const timeToUse = moveTimeInput || scheduleTime || '15:00';
    const formatted = formatDateWithTime(moveDateInput, timeToUse);
    onMoveFixture(fixtureId, formatted);
    setMovingFixtureId(null);
    setMoveDateInput('');
  };

  const handleToggleSelectForMove = (fId) => {
    setSelectedForMove((prev) => ({ ...prev, [fId]: !prev[fId] }));
  };

  const handleSelectAllUnplayedForMove = () => {
    const nextMap = {};
    Object.values(groupFixtures).forEach((list) => {
      (list || []).forEach((f) => {
        if (!f.played && !f.walkover) nextMap[f.id] = true;
      });
    });
    rounds.forEach((roundTies) => {
      (roundTies || []).forEach((tie) => {
        if (tie && tie.id && !tie.match?.played) nextMap[tie.id] = true;
      });
    });
    setSelectedForMove(nextMap);
  };

  const handleConfirmBulkMove = () => {
    if (!bulkMoveDate || !onBatchMoveFixtures) return;
    const selectedIds = Object.keys(selectedForMove).filter((id) => selectedForMove[id]);
    if (selectedIds.length === 0) return;

    const [startH, startM] = (bulkMoveTime || '15:00').split(':').map((x) => parseInt(x, 10) || 0);
    const dateMap = {};

    selectedIds.forEach((fId, idx) => {
      let finalH = startH;
      let finalM = startM;
      if (bulkSpaceOneHour) {
        const totalMinutes = startH * 60 + startM + idx * 60;
        finalH = Math.floor(totalMinutes / 60) % 24;
        finalM = totalMinutes % 60;
      }
      const timeStr = `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
      dateMap[fId] = formatDateWithTime(bulkMoveDate, timeStr);
    });

    onBatchMoveFixtures(dateMap);
    setSelectedForMove({});
    setShowBulkMoveTool(false);
  };

  const updateGoalDraft = (matchKey, teamId, field, value) => {
    setGoalDrafts((prev) => {
      const mDraft = prev[matchKey] || {};
      const tDraft = mDraft[teamId] || { playerId: '', type: 'goal', assistPlayerId: '' };
      return {
        ...prev,
        [matchKey]: {
          ...mDraft,
          [teamId]: {
            ...tDraft,
            [field]: value,
          },
        },
      };
    });
  };

  const updateInterfDraft = (matchKey, field, value) => {
    setInterfDrafts((prev) => {
      const current = prev[matchKey] || { teamId: '', playerId: '', type: 'yellow' };
      const next = { ...current, [field]: value };
      if (field === 'teamId') next.playerId = '';
      return { ...prev, [matchKey]: next };
    });
  };

  // Group standings per group letter
  const groupTables = useMemo(() => {
    const out = {};
    groupLetters.forEach((letter) => {
      const gTeams = (cupCategory?.teams || []).filter((t) => groupOf[t.id] === letter);
      const gFix = groupFixtures[letter] || [];
      out[letter] = computeGroupStandings(gTeams, gFix);
    });
    return out;
  }, [cupCategory, groupLetters, groupOf, groupFixtures]);

  // Detect Cup Champion if final tie is played
  const cupChampion = useMemo(() => {
    if (!rounds || rounds.length === 0) return null;
    const finalRound = rounds[rounds.length - 1];
    if (!finalRound || !finalRound[0]) return null;
    const res = getTieResult(finalRound[0]);
    if (res && res.winner && teamsById[res.winner]) {
      return teamsById[res.winner];
    }
    return null;
  }, [rounds, teamsById]);

  const toggleEditor = (key) => {
    setOpenEditorIds((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Propagate knockout winners across rounds when in CMS mode
  const propagateKnockoutRounds = (nextRounds) => {
    const cloned = nextRounds.map((r) => r.map((t) => (t ? { ...t, match: { ...t.match }, pen: { ...t.pen } } : null)));
    for (let r = 0; r < cloned.length - 1; r++) {
      for (let i = 0; i < cloned[r].length; i += 2) {
        const r1 = getTieResult(cloned[r][i]);
        const r2 = getTieResult(cloned[r][i + 1]);
        const hWinner = r1?.winner || null;
        const aWinner = r2?.winner || null;
        const slotIdx = Math.floor(i / 2);
        const existingNext = cloned[r + 1][slotIdx];
        if (existingNext) {
          cloned[r + 1][slotIdx] = {
            ...existingNext,
            home: hWinner || existingNext.home,
            away: aWinner !== null ? aWinner : existingNext.away,
          };
        } else if (hWinner || aWinner) {
          cloned[r + 1][slotIdx] = {
            id: `CUP-R${r + 2}-T${slotIdx + 1}`,
            stage: getRoundLabel(r + 1, cloned.length),
            date: 'TBD',
            home: hWinner,
            away: aWinner,
            match: { played: false, events: [] },
            pen: { h: '', a: '' },
          };
        }
      }
    }
    return cloned;
  };

  // CMS Handlers for Knockout Ties
  const handleToggleKoPlayed = (rIdx, tIdx) => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => {
      const nextRounds = (c.rounds || []).map((r, ri) =>
        r.map((tie, ti) => {
          if (ri === rIdx && ti === tIdx && tie) {
            return {
              ...tie,
              match: { ...tie.match, played: !tie.match?.played },
            };
          }
          return tie;
        })
      );
      return { ...c, rounds: propagateKnockoutRounds(nextRounds) };
    });
  };

  const handleSetKoReferee = (rIdx, tIdx, refName) => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => {
      let targetTieId = null;
      const nextRounds = (c.rounds || []).map((r, ri) =>
        r.map((tie, ti) => {
          if (ri === rIdx && ti === tIdx && tie) {
            targetTieId = tie.id;
            return {
              ...tie,
              referee: refName,
              match: { ...(tie.match || {}), referee: refName },
            };
          }
          return tie;
        })
      );
      const nextFixtures = targetTieId
        ? (c.fixtures || []).map((f) => (f.id === targetTieId ? { ...f, referee: refName } : f))
        : c.fixtures || [];
      return { ...c, rounds: nextRounds, fixtures: nextFixtures };
    });
  };

  const handleAddKoEvent = (rIdx, tIdx, ev) => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => {
      let targetTieId = null;
      const nextRounds = (c.rounds || []).map((r, ri) =>
        r.map((tie, ti) => {
          if (ri === rIdx && ti === tIdx && tie) {
            targetTieId = tie.id;
            const events = [...(tie.match?.events || []), ev];
            return {
              ...tie,
              match: { ...tie.match, played: true, events },
            };
          }
          return tie;
        })
      );
      const nextFixtures = targetTieId
        ? (c.fixtures || []).map((f) =>
            f.id === targetTieId ? { ...f, played: true, events: [...(f.events || []), ev] } : f
          )
        : c.fixtures || [];
      return { ...c, rounds: propagateKnockoutRounds(nextRounds), fixtures: nextFixtures };
    });
  };

  const handleRemoveKoEvent = (rIdx, tIdx, evIndex) => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => {
      let targetTieId = null;
      const nextRounds = (c.rounds || []).map((r, ri) =>
        r.map((tie, ti) => {
          if (ri === rIdx && ti === tIdx && tie) {
            targetTieId = tie.id;
            const events = [...(tie.match?.events || [])];
            events.splice(evIndex, 1);
            return {
              ...tie,
              match: { ...tie.match, events },
            };
          }
          return tie;
        })
      );
      const nextFixtures = targetTieId
        ? (c.fixtures || []).map((f) => {
            if (f.id === targetTieId) {
              const events = [...(f.events || [])];
              events.splice(evIndex, 1);
              return { ...f, events };
            }
            return f;
          })
        : c.fixtures || [];
      return { ...c, rounds: propagateKnockoutRounds(nextRounds), fixtures: nextFixtures };
    });
  };

  const handleSetKoPens = (rIdx, tIdx, side, val) => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => {
      const nextRounds = (c.rounds || []).map((r, ri) =>
        r.map((tie, ti) => {
          if (ri === rIdx && ti === tIdx && tie) {
            const pen = { ...(tie.pen || { h: '', a: '' }), [side]: val };
            return { ...tie, pen };
          }
          return tie;
        })
      );
      return { ...c, rounds: propagateKnockoutRounds(nextRounds) };
    });
  };

  // CMS Handlers for Group Stage Fixtures
  const handleToggleGroupPlayed = (letter, fId) => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => {
      const list = (c.groupFixtures?.[letter] || []).map((f) =>
        f.id === fId ? { ...f, played: !f.played } : f
      );
      const nextFixtures = (c.fixtures || []).map((f) =>
        f.id === fId ? { ...f, played: !f.played } : f
      );
      return {
        ...c,
        groupFixtures: { ...(c.groupFixtures || {}), [letter]: list },
        fixtures: nextFixtures,
      };
    });
  };

  const handleSetGroupReferee = (letter, fId, refName) => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => {
      const list = (c.groupFixtures?.[letter] || []).map((f) =>
        f.id === fId ? { ...f, referee: refName } : f
      );
      const nextFixtures = (c.fixtures || []).map((f) =>
        f.id === fId ? { ...f, referee: refName } : f
      );
      return {
        ...c,
        groupFixtures: { ...(c.groupFixtures || {}), [letter]: list },
        fixtures: nextFixtures,
      };
    });
  };

  const handleAddCupReferees = (e) => {
    e.preventDefault();
    if (!newCupRefInput.trim() || !onUpdateCupCategory) return;
    const names = newCupRefInput
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onUpdateCupCategory((c) => {
      const existing = c.referees || [];
      const merged = Array.from(new Set([...existing, ...names]));
      return { ...c, referees: merged };
    });
    setNewCupRefInput('');
  };

  const handleRemoveCupReferee = (refName) => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => ({
      ...c,
      referees: (c.referees || []).filter((r) => r !== refName),
    }));
  };

  const handleRandomizeCupReferees = () => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => {
      const pool = c.referees || [];
      if (!pool.length) return c;
      const pickRandomRef = () => pool[Math.floor(Math.random() * pool.length)];

      const isCompleted = (f) =>
        Boolean(
          f?.played ||
          f?.walkover ||
          (Array.isArray(f?.events) && f.events.length > 0) ||
          f?.match?.played ||
          f?.match?.walkover ||
          (Array.isArray(f?.match?.events) && f.match.events.length > 0) ||
          f?.winner ||
          (f?.home_score !== undefined && f?.home_score !== '') ||
          (f?.score1 !== undefined && f?.score1 !== '')
        );

      const completedFixtureIds = new Set();
      (c.fixtures || []).forEach((f) => {
        if (isCompleted(f)) completedFixtureIds.add(f.id);
      });
      if (c.groupFixtures) {
        Object.values(c.groupFixtures).forEach((list) => {
          (list || []).forEach((f) => {
            if (isCompleted(f)) completedFixtureIds.add(f.id);
          });
        });
      }
      if (c.rounds) {
        (c.rounds || []).forEach((r) => {
          const ties = Array.isArray(r) ? r : (r?.ties || []);
          ties.forEach((t) => {
            if (isCompleted(t)) completedFixtureIds.add(t.id);
          });
        });
      }

      const nextGroupFixtures = {};
      const refByFixId = {};
      Object.entries(c.groupFixtures || {}).forEach(([letter, list]) => {
        nextGroupFixtures[letter] = (list || []).map((f) => {
          if (completedFixtureIds.has(f.id) || isCompleted(f)) return f;
          const r = pickRandomRef();
          refByFixId[f.id] = r;
          return { ...f, referee: r };
        });
      });

      const nextRounds = (c.rounds || []).map((r) => {
        if (Array.isArray(r)) {
          return r.map((tie) => {
            if (!tie || completedFixtureIds.has(tie.id) || isCompleted(tie)) return tie;
            const rName = refByFixId[tie.id] || pickRandomRef();
            if (tie.id) refByFixId[tie.id] = rName;
            return {
              ...tie,
              referee: rName,
              match: { ...(tie.match || {}), referee: rName },
            };
          });
        } else if (r && typeof r === 'object' && Array.isArray(r.ties)) {
          return {
            ...r,
            ties: r.ties.map((tie) => {
              if (!tie || completedFixtureIds.has(tie.id) || isCompleted(tie)) return tie;
              const rName = refByFixId[tie.id] || pickRandomRef();
              if (tie.id) refByFixId[tie.id] = rName;
              return {
                ...tie,
                referee: rName,
                match: { ...(tie.match || {}), referee: rName },
              };
            }),
          };
        }
        return r;
      });

      const nextFixtures = (c.fixtures || []).map((f) => {
        if (completedFixtureIds.has(f.id) || isCompleted(f)) return f;
        return { ...f, referee: refByFixId[f.id] || pickRandomRef() };
      });

      return {
        ...c,
        groupFixtures: nextGroupFixtures,
        rounds: nextRounds,
        fixtures: nextFixtures,
      };
    });
  };

  const handleAddGroupEvent = (letter, fId, ev) => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => {
      const list = (c.groupFixtures?.[letter] || []).map((f) =>
        f.id === fId ? { ...f, played: true, events: [...(f.events || []), ev] } : f
      );
      const nextFixtures = (c.fixtures || []).map((f) =>
        f.id === fId ? { ...f, played: true, events: [...(f.events || []), ev] } : f
      );
      return {
        ...c,
        groupFixtures: { ...(c.groupFixtures || {}), [letter]: list },
        fixtures: nextFixtures,
      };
    });
  };

  const handleRemoveGroupEvent = (letter, fId, evIdx) => {
    if (!onUpdateCupCategory) return;
    onUpdateCupCategory((c) => {
      const list = (c.groupFixtures?.[letter] || []).map((f) => {
        if (f.id === fId) {
          const events = [...(f.events || [])];
          events.splice(evIdx, 1);
          return { ...f, events };
        }
        return f;
      });
      const nextFixtures = (c.fixtures || []).map((f) => {
        if (f.id === fId) {
          const events = [...(f.events || [])];
          events.splice(evIdx, 1);
          return { ...f, events };
        }
        return f;
      });
      return {
        ...c,
        groupFixtures: { ...(c.groupFixtures || {}), [letter]: list },
        fixtures: nextFixtures,
      };
    });
  };

  if (!cupCategory || cupCategory.mode !== 'cup') {
    return (
      <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '14px', padding: '36px', textAlign: 'center', color: '#8E8E93' }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🏆</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '6px' }}>No Active Cup Tournament</div>
        <div style={{ fontSize: '13px', color: '#8E8E93' }}>
          There is currently no knockout Cup tournament in progress. The active competition is <strong>Ruiru Titans League - Oct/Nov 2026</strong>.
        </div>
      </div>
    );
  }

  const formatScorersList = (events, homeId, awayId) => {
    const homeScorers = [];
    const awayScorers = [];
    const interferenceEvents = [];

    (events || []).forEach((e) => {
      const t = teamsById[e.teamId];
      const p = t?.players?.find((pp) => pp.id === e.playerId);
      const isInterf = Boolean(
        e.interference || (homeId && awayId && e.teamId !== homeId && e.teamId !== awayId)
      );

      if (isInterf && (e.type === 'yellow' || e.type === 'red')) {
        interferenceEvents.push({
          player: p?.name || 'Player',
          teamName: t?.name || e.teamId,
          type: e.type,
        });
      } else if (e.type === 'goal') {
        const a = e.assistPlayerId ? t?.players?.find((pp) => pp.id === e.assistPlayerId) : null;
        const penTag = e.penalty ? ' (Pen)' : '';
        const assistTag = a ? ` (🅰️ ${a.name})` : '';
        const label = (p ? p.name : 'Goal') + penTag + assistTag;
        if (e.teamId === homeId) homeScorers.push(label);
        else if (e.teamId === awayId) awayScorers.push(label);
      } else if (e.type === 'owngoal') {
        const label = `${p ? p.name : 'Player'} (OG)`;
        if (e.teamId === homeId) awayScorers.push(label);
        else if (e.teamId === awayId) homeScorers.push(label);
      }
    });
    return { homeScorers, awayScorers, interferenceEvents };
  };

  const DAYS_MAP = [
    { num: 1, label: 'Mon' },
    { num: 2, label: 'Tue' },
    { num: 3, label: 'Wed' },
    { num: 4, label: 'Thu' },
    { num: 5, label: 'Fri' },
    { num: 6, label: 'Sat' },
    { num: 0, label: 'Sun' },
  ];

  // Progression roadmap steps
  const progressionLevels = [
    { key: 'groups', label: 'Level 1: Group Stage', sub: `${groupLetters.length} Groups (${cupCategory.teams?.length || 0} Teams)`, icon: '🛡️' },
    ...rounds.map((r, idx) => ({
      key: `round-${idx}`,
      label: `Level ${idx + 2}: ${getRoundLabel(idx, rounds.length)}`,
      sub: `${r.length} Knockout ${r.length === 1 ? 'Tie' : 'Ties'}`,
      icon: idx === rounds.length - 1 ? '🏆' : '⚔️',
    })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Cup Banner & Progression Level Roadmap */}
      <div
        style={{
          background: 'linear-gradient(135deg, #121212 0%, #092119 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '22px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
          <div>
            <div style={{ color: '#FF9500', fontSize: '11px', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              KNOCKOUT ROADMAP &amp; STAGE PROGRESSION
            </div>
            <h2 className="scoreboard" style={{ fontSize: '30px', color: '#FFFFFF', margin: '4px 0' }}>
              🏆 {cupCategory.label.toUpperCase()} — PROGRESSION LEVELS &amp; FIXTURES
            </h2>
            <div style={{ fontSize: '12.5px', color: '#8E8E93' }}>
              Follow every stage from the Group Stage qualifiers through Quarter-Finals, Semi-Finals, and the Grand Final.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => openCategoryFixturesResultsPDF(cupCategoryKey)}
              style={{
                background: '#000000',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '999px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Download official Cup fixtures schedule, bracket & results PDF report"
            >
              📄 Download Cup PDF
            </button>

            {isCmsMode && (
              <button
                type="button"
                onClick={() => setShowScheduleConfig(!showScheduleConfig)}
                style={{
                  background: showScheduleConfig ? '#FF9500' : '#1C1C1E',
                  color: showScheduleConfig ? '#16201B' : '#EBEBF5',
                  border: '1px solid #2F7D5C',
                  borderRadius: '999px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🗓️ Match Days &amp; Schedule
              </button>
            )}

            {cupCategoriesList.length > 1 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {cupCategoriesList.map((item) => {
                  const k = item.key || item[0];
                  const lbl = item.label || item[1]?.label;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onSelectCupCategory && onSelectCupCategory(k)}
                      style={{
                        background: k === cupCategoryKey ? '#FF9500' : '#1C1C1E',
                        color: k === cupCategoryKey ? '#16201B' : '#EBEBF5',
                        border: 'none',
                        borderRadius: '999px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* CUP TOURNAMENT MATCH SCHEDULING CONFIGURATION BAR (ADMIN) */}
        {isCmsMode && showScheduleConfig && (
          <div
            style={{
              background: '#121212',
              border: '2px solid #FF9500',
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  🗓️ Cup Match Days &amp; Per-Day Fixtures Configuration
                </span>
                <div style={{ fontSize: '11.5px', color: '#8E8E93', marginTop: '2px' }}>
                  Configure the number of games played on each specific day of the week. Games on the same day are separated by <strong>exactly 1 hour</strong>.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowBulkMoveTool(!showBulkMoveTool)}
                  style={{
                    background: showBulkMoveTool ? '#FF9500' : '#1C1C1E',
                    color: showBulkMoveTool ? '#16201B' : '#EBEBF5',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {showBulkMoveTool ? '✕ Hide Bulk Move' : '📦 Move Fixtures to Another Day'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowScheduleConfig(false)}
                  style={{ background: 'transparent', border: 'none', color: '#8E8E93', cursor: 'pointer', fontSize: '12px' }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* 1. Global Start Time & Info Strip */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: '#121212', padding: '10px 12px', borderRadius: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#EBEBF5', marginBottom: '3px' }}>
                  Cup Start Date:
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={scheduleStartDate}
                  onChange={(e) => setScheduleStartDate(e.target.value)}
                  style={{ width: '135px', fontSize: '12px', padding: '5px 8px' }}
                  title="First match day start date for the Cup tournament"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#EBEBF5', marginBottom: '3px' }}>
                  Default Kickoff Time:
                </label>
                <input
                  type="time"
                  className="form-input"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  style={{ width: '115px', fontSize: '12px', padding: '5px 8px' }}
                />
              </div>
              <div style={{ flex: '1 1 240px', fontSize: '11px', color: '#6CE5A0', lineHeight: 1.4 }}>
                ⚡ <strong>1-Hour Difference Rule:</strong> All fixtures scheduled on the same date start 1 hour apart (e.g. 14:00, 15:00, 16:00).
              </div>
            </div>

            {/* 2. Per-Day Configuration Grid */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#EBEBF5', marginBottom: '6px' }}>
                Number of Games &amp; Start Time Set on a Per-Day Basis:
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '8px',
                }}
              >
                {DAYS_MAP.map((d) => {
                  const dayCfg = daysConfig[d.num] || { enabled: false, matches: 1, time: scheduleTime };
                  const isEnabled = Boolean(dayCfg.enabled);
                  return (
                    <div
                      key={d.num}
                      style={{
                        background: isEnabled ? 'rgba(255, 149, 0, 0.12)' : '#121212',
                        border: isEnabled ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => handleToggleScheduleDay(d.num)}
                          style={{ accentColor: '#FF9500', width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: 800, color: isEnabled ? '#FF9500' : '#8E8E93' }}>
                          {d.label}
                        </span>
                      </label>

                      {isEnabled && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                            <span style={{ fontSize: '10px', color: '#8E8E93' }}>Games:</span>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              className="form-input"
                              value={dayCfg.matches || 1}
                              onChange={(e) => handleUpdateDayMatches(d.num, e.target.value)}
                              style={{ width: '56px', fontSize: '11px', padding: '3px 6px', textAlign: 'center' }}
                              title={`Number of games to be played on ${d.label}`}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                            <span style={{ fontSize: '10px', color: '#8E8E93' }}>Start:</span>
                            <input
                              type="time"
                              className="form-input"
                              value={dayCfg.time || scheduleTime}
                              onChange={(e) => handleUpdateDayTime(d.num, e.target.value)}
                              style={{ width: '84px', fontSize: '11px', padding: '3px 4px' }}
                              title={`Kickoff start time for first game on ${d.label}`}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action buttons: Save & Apply to unplayed */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '4px' }}>
              <button
                type="button"
                onClick={() => handleSaveSchedule(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                💾 Save Cup Schedule Rules
              </button>
              <button
                type="button"
                onClick={() => handleSaveSchedule(true)}
                style={{
                  background: '#FF9500',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
                title="Recalculate slots for unplayed cup matches using per-day game limits and 1hr differences"
              >
                ⚡ Re-Schedule All Unplayed Cup Matches
              </button>
            </div>

            {/* BULK MOVE FIXTURES TOOL */}
            {showBulkMoveTool && (
              <div
                style={{
                  marginTop: '6px',
                  background: '#041610',
                  border: '1px dashed #FF9500',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#FF9500' }}>
                  📦 Move Multiple Selected Cup Fixtures to Another Day
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                  Tick the fixtures in the group matches and knockout ties below using their checkboxes, then pick the target date and starting kickoff time:
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#8E8E93', marginBottom: '2px' }}>
                      Target Date:
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={bulkMoveDate}
                      onChange={(e) => setBulkMoveDate(e.target.value)}
                      style={{ width: '150px', fontSize: '12px', padding: '6px 8px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10.5px', color: '#8E8E93', marginBottom: '2px' }}>
                      First Match Kickoff:
                    </label>
                    <input
                      type="time"
                      className="form-input"
                      value={bulkMoveTime}
                      onChange={(e) => setBulkMoveTime(e.target.value)}
                      style={{ width: '110px', fontSize: '12px', padding: '6px 8px' }}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#EBEBF5', cursor: 'pointer', paddingBottom: '6px' }}>
                    <input
                      type="checkbox"
                      checked={bulkSpaceOneHour}
                      onChange={(e) => setBulkSpaceOneHour(e.target.checked)}
                      style={{ accentColor: '#FF9500' }}
                    />
                    Space matches 1 hour apart
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllUnplayedForMove}
                    style={{
                      background: '#1C1C1E',
                      color: '#EBEBF5',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      padding: '7px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Select All Unplayed
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBulkMove}
                    disabled={!bulkMoveDate || Object.values(selectedForMove).filter(Boolean).length === 0}
                    style={{
                      background:
                        bulkMoveDate && Object.values(selectedForMove).filter(Boolean).length > 0
                          ? '#FF9500'
                          : '#1C1C1E',
                      color:
                        bulkMoveDate && Object.values(selectedForMove).filter(Boolean).length > 0
                          ? '#16201B'
                          : '#8E8E93',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 14px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor:
                        bulkMoveDate && Object.values(selectedForMove).filter(Boolean).length > 0
                          ? 'pointer'
                          : 'not-allowed',
                    }}
                  >
                    Move {Object.values(selectedForMove).filter(Boolean).length} Selected Fixtures ➔
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Visual Progression Level Stepper */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedLevel('all')}
            style={{
              background: selectedLevel === 'all' ? 'rgba(255, 149, 0, 0.18)' : '#0B231B',
              border: selectedLevel === 'all' ? '2px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '12px',
              textAlign: 'left',
              cursor: 'pointer',
              color: '#FFFFFF',
            }}
          >
            <div style={{ fontSize: '11px', color: '#FF9500', fontWeight: 800, textTransform: 'uppercase' }}>
              COMPLETE OVERVIEW
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '2px' }}>
              🗺️ All Progression Levels
            </div>
            <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '2px' }}>
              Groups + Full Knockout Bracket
            </div>
          </button>

          {progressionLevels.map((lvl) => {
            const active = selectedLevel === lvl.key;
            return (
              <button
                key={lvl.key}
                type="button"
                onClick={() => setSelectedLevel(lvl.key)}
                style={{
                  background: active ? 'rgba(255, 149, 0, 0.18)' : '#0B231B',
                  border: active ? '2px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#FFFFFF',
                }}
              >
                <div style={{ fontSize: '11px', color: '#FF9500', fontWeight: 800, textTransform: 'uppercase' }}>
                  {lvl.icon} {lvl.label.split(':')[0]}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '2px' }}>
                  {lvl.label.split(':')[1] || lvl.label}
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '2px' }}>
                  {lvl.sub}
                </div>
              </button>
            );
          })}
        </div>

        {cupChampion && (
          <div
            style={{
              background: '#FF9500',
              color: '#16201B',
              borderRadius: '10px',
              padding: '12px 16px',
              textAlign: 'center',
              fontWeight: 800,
              marginTop: '8px',
            }}
          >
            🏆 OFFICIAL CUP CHAMPION: {cupChampion.name.toUpperCase()} 🏆
          </div>
        )}

        {/* CMS REFEREES FORM & RANDOMIZE BAR FOR CUP */}
        {isCmsMode && (
          <div
            style={{
              marginTop: '14px',
              background: '#0B231B',
              border: '1px solid #2A5A46',
              borderRadius: '12px',
              padding: '12px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  🧑‍⚖️ Cup Competition Referees Pool ({referees.length})
                </div>
                <div style={{ fontSize: '11.5px', color: '#8E8E93' }}>
                  Add officials and randomize across unplayed Group &amp; Knockout fixtures, or change any unplayed fixture&apos;s referee below.
                </div>
              </div>
              <button
                type="button"
                className="btn-gold"
                style={{ padding: '7px 14px', fontSize: '12px' }}
                disabled={referees.length === 0}
                onClick={handleRandomizeCupReferees}
              >
                🎲 Randomize Referees (Unplayed)
              </button>
            </div>

            <form
              onSubmit={handleAddCupReferees}
              style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: referees.length > 0 ? '10px' : 0 }}
            >
              <input
                type="text"
                className="form-input"
                placeholder="Add referee(s) — e.g. Ref Kamau, Ref Otieno, Ref Njoroge"
                value={newCupRefInput}
                onChange={(e) => setNewCupRefInput(e.target.value)}
                style={{ flex: '1 1 240px', padding: '7px 12px', fontSize: '12.5px' }}
              />
              <button type="submit" className="btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }}>
                + Add Referee(s)
              </button>
            </form>

            {referees.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {referees.map((r) => (
                  <span
                    key={r}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#133529',
                      border: '1px solid #2A5A46',
                      borderRadius: '999px',
                      padding: '3px 10px',
                      fontSize: '11.5px',
                      color: '#FFFFFF',
                      fontWeight: 600,
                    }}
                  >
                    🧑‍⚖️ {r}
                    <button
                      type="button"
                      onClick={() => handleRemoveCupReferee(r)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#EF4444',
                        cursor: 'pointer',
                        fontSize: '11px',
                        padding: 0,
                        lineHeight: 1,
                      }}
                      title={`Remove ${r}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 1: KNOCKOUT PROGRESSION BRACKET & RESPECTIVE KNOCKOUT FIXTURES */}
      {(selectedLevel === 'all' || selectedLevel.startsWith('round-')) && rounds.length > 0 && (
        <div
          style={{
            background: '#121212',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              paddingBottom: '12px',
              marginBottom: '18px',
            }}
          >
            <div>
              <div style={{ color: '#FF9500', fontSize: '11px', fontWeight: 800, letterSpacing: '0.12em' }}>
                KNOCKOUT BRACKET TREE
              </div>
              <h3 className="scoreboard" style={{ fontSize: '24px', color: '#FFFFFF', margin: '2px 0 0' }}>
                CUP KNOCKOUT PROGRESSION &amp; TIES
              </h3>
            </div>

            {/* Filter by Results / Upcoming */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { key: 'all', label: 'All Ties' },
                { key: 'results', label: '✅ Completed Results' },
                { key: 'upcoming', label: '📅 Upcoming Ties' },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFixtureFilter(f.key)}
                  style={{
                    background: fixtureFilter === f.key ? '#FF9500' : '#1C1C1E',
                    color: fixtureFilter === f.key ? '#16201B' : '#EBEBF5',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-Column Knockout Progression Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                selectedLevel === 'all'
                  ? `repeat(${Math.min(rounds.length, 3)}, minmax(270px, 1fr))`
                  : '1fr',
              gap: '18px',
              overflowX: 'auto',
            }}
          >
            {rounds.map((roundTies, rIdx) => {
              if (selectedLevel !== 'all' && selectedLevel !== `round-${rIdx}`) return null;
              const stageTitle = getRoundLabel(rIdx, rounds.length);

              const filteredTies = roundTies
                .map((tie, tIdx) => ({ tie, tIdx }))
                .filter(({ tie }) => {
                  if (!tie) return fixtureFilter !== 'results';
                  const isPlayed = Boolean(tie.match?.played);
                  if (fixtureFilter === 'results') return isPlayed;
                  if (fixtureFilter === 'upcoming') return !isPlayed;
                  return true;
                });

              return (
                <div
                  key={rIdx}
                  style={{
                    background: '#09221A',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid #1C1C1E',
                      paddingBottom: '8px',
                    }}
                  >
                    <span className="scoreboard" style={{ fontSize: '20px', color: '#FF9500', letterSpacing: '0.06em' }}>
                      {rIdx === rounds.length - 1 ? '🏆 ' : '⚔️ '}
                      {stageTitle.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#8E8E93',
                        background: '#1C1C1E',
                        padding: '2px 8px',
                        borderRadius: '999px',
                      }}
                    >
                      Level {rIdx + 2}
                    </span>
                  </div>

                  {filteredTies.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#8E8E93' }}>
                      No ties match the selected filter in this stage.
                    </div>
                  )}

                  {filteredTies.map(({ tie, tIdx }) => {
                    if (!tie) {
                      return (
                        <div
                          key={tIdx}
                          style={{
                            border: '1px dashed rgba(255, 255, 255, 0.1)',
                            borderRadius: '10px',
                            padding: '14px',
                            textAlign: 'center',
                            color: '#8E8E93',
                            fontSize: '12px',
                          }}
                        >
                          Awaiting previous round qualifiers
                        </div>
                      );
                    }

                    const homeTeam = teamsById[tie.home];
                    const awayTeam = teamsById[tie.away];
                    const res = getTieResult(tie);
                    const isPlayed = Boolean(tie.match?.played);
                    const { hs, as } = computeFixtureScore(tie.match, tie.home, tie.away);
                    const { homeScorers, awayScorers, interferenceEvents } = formatScorersList(
                      tie.match?.events,
                      tie.home,
                      tie.away
                    );
                    const editorKey = `ko-${rIdx}-${tIdx}`;
                    const isOpenEditor = !!openEditorIds[editorKey];
                    const suspendedList = (suspensions || {})[tie.id] || [];

                    // Non-playing teams for this tie
                    const otherTeams = allTeamsList.filter((t) => t.id !== tie.home && t.id !== tie.away);
                    const curInterf = interfDrafts[editorKey] || { teamId: '', playerId: '', type: 'yellow' };
                    const selectedInterfTeam = teamsById[curInterf.teamId];

                    return (
                      <div
                        key={tie.id || tIdx}
                        className="tie-card"
                        style={{
                          background: '#121212',
                          border: isPlayed ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '10px',
                          padding: '12px',
                        }}
                      >
                        {/* Tie Header: Stage & Date */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#8E8E93', marginBottom: '8px', flexWrap: 'wrap', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {showBulkMoveTool && isCmsMode && !isPlayed && tie.id && (
                              <input
                                type="checkbox"
                                checked={Boolean(selectedForMove[tie.id])}
                                onChange={() => handleToggleSelectForMove(tie.id)}
                                style={{ accentColor: '#FF9500', width: '15px', height: '15px', cursor: 'pointer' }}
                                title="Select tie to move date"
                              />
                            )}
                            <span style={{ fontWeight: 700, color: '#FF9500' }}>
                              {tie.stage || `${stageTitle} #${tIdx + 1}`}
                            </span>
                            {(tie.is_rescheduled || tie.match?.is_rescheduled) && (
                              <span
                                style={{
                                  background: 'rgba(255, 149, 0, 0.2)',
                                  color: '#FF9F0A',
                                  fontSize: '9.5px',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                🗓️ MOVED
                              </span>
                            )}
                          </div>
                          <span>
                            {isPlayed ? (
                              <span style={{ color: '#22C55E', fontWeight: 700 }}>✓ RESULT · {tie.date}</span>
                            ) : (
                              <span style={{ color: '#F59E0B', fontWeight: 700 }}>📅 {tie.date || 'TBD'}</span>
                            )}
                          </span>
                        </div>

                        {/* Inline Single Tie Reschedule Panel */}
                        {isCmsMode && movingFixtureId === tie.id && (
                          <div
                            className="reschedule-panel"
                            style={{
                              background: '#121212',
                              border: '1px solid #FF9500',
                              borderRadius: '8px',
                              padding: '10px 12px',
                              marginBottom: '10px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#FF9500' }}>
                                🗓️ Reschedule Match &ldquo;{homeTeam?.name || 'TBD'} vs {awayTeam?.name || 'TBD'}&rdquo;
                              </span>
                              <button
                                type="button"
                                onClick={() => setMovingFixtureId(null)}
                                style={{ background: 'transparent', border: 'none', color: '#8E8E93', cursor: 'pointer', fontSize: '12px' }}
                              >
                                ✕
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                              <div>
                                <label style={{ display: 'block', fontSize: '10.5px', color: '#8E8E93', marginBottom: '2px' }}>
                                  Choose New Date:
                                </label>
                                <input
                                  type="date"
                                  className="form-input"
                                  value={moveDateInput}
                                  onChange={(e) => setMoveDateInput(e.target.value)}
                                  style={{ padding: '6px 8px', fontSize: '12px', width: '150px' }}
                                  required
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '10.5px', color: '#8E8E93', marginBottom: '2px' }}>
                                  Kickoff Time:
                                </label>
                                <input
                                  type="time"
                                  className="form-input"
                                  value={moveTimeInput}
                                  onChange={(e) => setMoveTimeInput(e.target.value)}
                                  style={{ padding: '6px 8px', fontSize: '12px', width: '110px' }}
                                  required
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleConfirmSingleMove(tie.id)}
                                disabled={!moveDateInput}
                                style={{
                                  background: moveDateInput ? '#FF9500' : '#1C1C1E',
                                  color: moveDateInput ? '#16201B' : '#8E8E93',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '8px 14px',
                                  fontSize: '11.5px',
                                  fontWeight: 800,
                                  cursor: moveDateInput ? 'pointer' : 'not-allowed',
                                }}
                              >
                                Save Date &amp; Time
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Home Team Row */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '7px 10px',
                            borderRadius: '6px',
                            marginBottom: '4px',
                            background: res?.winner === tie.home ? 'rgba(255, 149, 0, 0.14)' : '#121212',
                            border: res?.winner === tie.home ? '1px solid rgba(255, 149, 0, 0.45)' : '1px solid transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: homeTeam?.color || 'rgba(255, 255, 255, 0.1)',
                              }}
                            />
                            {onSelectTeam && tie.home && homeTeam ? (
                              <button
                                type="button"
                                className="team-link-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectTeam(tie.home, cupCategoryKey);
                                }}
                                style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)' }}
                                title={`Click to view ${homeTeam.name} profile, cup trajectory & odds`}
                              >
                                {homeTeam.name}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                                {homeTeam?.name || 'TBD (Qualifier)'}
                              </span>
                            )}
                            {res?.winner === tie.home && (
                              <span style={{ fontSize: '10px', background: '#FF9500', color: '#16201B', fontWeight: 800, padding: '1px 6px', borderRadius: '4px' }}>
                                ADVANCES
                              </span>
                            )}
                          </div>
                          <span className="scoreboard" style={{ fontSize: '20px', color: isPlayed ? '#FF9500' : '#8E8E93' }}>
                            {isPlayed ? hs : '-'}
                          </span>
                        </div>

                        {/* Away Team Row */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '7px 10px',
                            borderRadius: '6px',
                            background: res?.winner === tie.away ? 'rgba(255, 149, 0, 0.14)' : '#121212',
                            border: res?.winner === tie.away ? '1px solid rgba(255, 149, 0, 0.45)' : '1px solid transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: awayTeam?.color || 'rgba(255, 255, 255, 0.1)',
                              }}
                            />
                            {onSelectTeam && tie.away && awayTeam ? (
                              <button
                                type="button"
                                className="team-link-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectTeam(tie.away, cupCategoryKey);
                                }}
                                style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)' }}
                                title={`Click to view ${awayTeam.name} profile, cup trajectory & odds`}
                              >
                                {awayTeam.name}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                                {awayTeam?.name || 'Winner SF2 (TBD)'}
                              </span>
                            )}
                            {res?.winner === tie.away && (
                              <span style={{ fontSize: '10px', background: '#FF9500', color: '#16201B', fontWeight: 800, padding: '1px 6px', borderRadius: '4px' }}>
                                ADVANCES
                              </span>
                            )}
                          </div>
                          <span className="scoreboard" style={{ fontSize: '20px', color: isPlayed ? '#FF9500' : '#8E8E93' }}>
                            {isPlayed ? as : '-'}
                          </span>
                        </div>

                        {/* Penalty Shootout Banner if applicable */}
                        {res?.onPens && (
                          <div
                            style={{
                              marginTop: '6px',
                              textAlign: 'center',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#FF9500',
                              background: 'rgba(255, 149, 0, 0.1)',
                              padding: '4px',
                              borderRadius: '5px',
                            }}
                          >
                            🎯 Won {res.ph} – {res.pa} on Penalty Shootout
                          </div>
                        )}

                        {/* Scorers Summary */}
                        {(homeScorers.length > 0 || awayScorers.length > 0) && (
                          <div style={{ marginTop: '6px', fontSize: '11px', color: '#8E8E93', lineHeight: 1.4 }}>
                            {homeScorers.length > 0 && (
                              <div>
                                ⚽ <strong>{homeTeam?.id}:</strong> {homeScorers.join(', ')}
                              </div>
                            )}
                            {awayScorers.length > 0 && (
                              <div>
                                ⚽ <strong>{awayTeam?.id}:</strong> {awayScorers.join(', ')}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Interference Bookings */}
                        {interferenceEvents.length > 0 && (
                          <div style={{ marginTop: '6px', padding: '4px 8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', fontSize: '11px', color: '#FF9F0A' }}>
                            🚨 <strong>Interference Bookings:</strong>{' '}
                            {interferenceEvents.map((ev, i) => (
                              <span key={i} style={{ marginRight: '8px' }}>
                                {ev.type === 'red' ? '🟥' : '🟨'} {ev.player} ({ev.teamName}) — misses their team&apos;s next match
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Suspensions Line */}
                        {suspendedList.length > 0 && (
                          <div style={{ marginTop: '6px', textAlign: 'center', fontSize: '11px', color: '#FF8A80', background: 'rgba(226, 74, 59, 0.12)', border: '1px solid rgba(226, 74, 59, 0.35)', borderRadius: '6px', padding: '4px 8px' }}>
                            🚫 <strong>Suspended (Misses Match):</strong>{' '}
                            {suspendedList.map((s) => `${s.playerName} (${teamsById[s.teamId]?.name || s.teamId} — ${s.reason})`).join(' · ')}
                          </div>
                        )}

                        {/* Footer Actions: Referee / H2H, Sheet, & CMS Edit */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #1C1C1E', flexWrap: 'wrap', gap: '6px' }}>
                          {isCmsMode && !isPlayed ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '11px', color: '#FF9500' }}>🧑‍⚖️</span>
                              <select
                                className="form-input"
                                style={{ fontSize: '11px', padding: '2px 6px', height: '24px', minWidth: '125px' }}
                                value={tie.referee || tie.match?.referee || ''}
                                onChange={(e) => handleSetKoReferee(rIdx, tIdx, e.target.value)}
                              >
                                <option value="">Assign Referee...</option>
                                {referees.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#8E8E93' }}>
                              🧑‍⚖️ {tie.referee || tie.match?.referee || 'Official TBD'}
                            </span>
                          )}
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {homeTeam && awayTeam && onOpenH2H && (
                              <button
                                type="button"
                                className="btn-pill-action"
                                onClick={() => onOpenH2H(homeTeam.id, awayTeam.id)}
                              >
                                ⚔️ H2H
                              </button>
                            )}
                            {tie.id && (
                              <a
                                href={`/fixtures/${tie.id}/sheet/`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-pill-action"
                              >
                                📄 Sheet
                              </a>
                            )}
                            {isCmsMode && !isPlayed && tie.id && onMoveFixture && (
                              <button
                                type="button"
                                className="btn-pill-action"
                                onClick={() => {
                                  setMovingFixtureId(movingFixtureId === tie.id ? null : tie.id);
                                  setMoveDateInput('');
                                }}
                                style={{
                                  background: movingFixtureId === tie.id ? '#FF9500' : '#1C1C1E',
                                  color: movingFixtureId === tie.id ? '#16201B' : '#EBEBF5',
                                  borderColor: '#2F7D5C',
                                }}
                                title="Move this tie to another date and time"
                              >
                                🗓️ Move Date
                              </button>
                            )}
                            {isCmsMode && (
                              <button
                                type="button"
                                className="btn-pill-action"
                                onClick={() => toggleEditor(editorKey)}
                                style={{ borderColor: '#FF9500', color: '#FF9500' }}
                              >
                                {isOpenEditor ? 'Close CMS ▲' : '✏️ Record Tie Events'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* CMS Knockout Tie Editor */}
                        {isCmsMode && isOpenEditor && (
                          <div style={{ marginTop: '10px', background: '#000000', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500' }}>CMS: TIE SCORE &amp; MATCH EVENTS</span>
                              <button
                                type="button"
                                className="played-toggle"
                                onClick={() => handleToggleKoPlayed(rIdx, tIdx)}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  background: isPlayed ? '#FF9500' : 'transparent',
                                  color: isPlayed ? '#16201B' : '#EBEBF5',
                                  borderColor: '#FF9500',
                                }}
                              >
                                {isPlayed ? '✓ Marked Final' : 'Mark Final'}
                              </button>
                            </div>

                            {/* Existing Events */}
                            <div style={{ marginBottom: '8px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                              {(tie.match?.events || []).map((ev, evIdx) => {
                                const t = teamsById[ev.teamId];
                                const p = t?.players?.find((pp) => pp.id === ev.playerId);
                                const a = ev.assistPlayerId ? t?.players?.find((pp) => pp.id === ev.assistPlayerId) : null;
                                const isInterf = Boolean(
                                  ev.interference || (tie.home && tie.away && ev.teamId !== tie.home && ev.teamId !== tie.away)
                                );
                                let lbl = `${p?.name || 'Player'} (${t?.id || ev.teamId})`;
                                if (ev.type === 'goal') {
                                  if (ev.penalty) lbl += ' [Pen]';
                                  if (a) lbl += ` [🅰️ ${a.name}]`;
                                } else if (ev.type === 'owngoal') {
                                  lbl += ' [OG]';
                                } else if (isInterf) {
                                  lbl += ' [🚨 INTERFERENCE]';
                                }

                                return (
                                  <span key={evIdx} className="ev-chip">
                                    <span>{ev.type === 'goal' ? (ev.penalty ? '🎯⚽' : '⚽') : ev.type === 'owngoal' ? '🥅' : ev.type === 'yellow' ? '🟨' : '🟥'}</span>
                                    <span>{lbl}</span>
                                    <span className="ev-remove" onClick={() => handleRemoveKoEvent(rIdx, tIdx, evIdx)}>✕</span>
                                  </span>
                                );
                              })}
                            </div>

                            {/* Goal & Card Recorders per playing team */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                              {[homeTeam, awayTeam].filter(Boolean).map((team) => {
                                const tDraft = goalDrafts[editorKey]?.[team.id] || { playerId: '', type: 'goal', assistPlayerId: '' };
                                const teamPlayers = team.players || [];
                                const assistCandidates = teamPlayers.filter((p) => p.id !== tDraft.playerId && !p.unknown);

                                return (
                                  <div key={team.id} style={{ background: '#121212', padding: '8px', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#FF9500', marginBottom: '4px' }}>
                                      {team.name}
                                    </div>
                                    <select
                                      className="form-input"
                                      style={{ fontSize: '11px', padding: '3px', marginBottom: '4px' }}
                                      value={tDraft.playerId}
                                      onChange={(e) => updateGoalDraft(editorKey, team.id, 'playerId', e.target.value)}
                                    >
                                      <option value="">Select Scorer…</option>
                                      {teamPlayers.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                      ))}
                                    </select>

                                    <div style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
                                      <select
                                        className="form-input"
                                        style={{ fontSize: '10.5px', padding: '3px', flex: 1 }}
                                        value={tDraft.type}
                                        onChange={(e) => updateGoalDraft(editorKey, team.id, 'type', e.target.value)}
                                      >
                                        <option value="goal">⚽ Regular</option>
                                        <option value="penalty">🎯 Penalty</option>
                                        <option value="owngoal">🥅 Own Goal</option>
                                      </select>
                                      {tDraft.type === 'goal' && (
                                        <select
                                          className="form-input"
                                          style={{ fontSize: '10.5px', padding: '3px', flex: 1 }}
                                          value={tDraft.assistPlayerId}
                                          onChange={(e) => updateGoalDraft(editorKey, team.id, 'assistPlayerId', e.target.value)}
                                        >
                                          <option value="">🅰️ Unassisted</option>
                                          {assistCandidates.map((p) => (
                                            <option key={p.id} value={p.id}>Assist: {p.name}</option>
                                          ))}
                                        </select>
                                      )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      <button
                                        type="button"
                                        disabled={!tDraft.playerId}
                                        onClick={() => {
                                          if (!tDraft.playerId) return;
                                          handleAddKoEvent(rIdx, tIdx, {
                                            teamId: team.id,
                                            playerId: tDraft.playerId,
                                            type: tDraft.type === 'owngoal' ? 'owngoal' : 'goal',
                                            ...(tDraft.type === 'penalty' ? { penalty: true } : {}),
                                            ...(tDraft.type === 'goal' && tDraft.assistPlayerId ? { assistPlayerId: tDraft.assistPlayerId } : {}),
                                          });
                                          updateGoalDraft(editorKey, team.id, 'playerId', '');
                                          updateGoalDraft(editorKey, team.id, 'assistPlayerId', '');
                                          updateGoalDraft(editorKey, team.id, 'type', 'goal');
                                        }}
                                        style={{
                                          background: tDraft.playerId ? '#FF9500' : '#1B3D30',
                                          color: tDraft.playerId ? '#16201B' : '#5C7A6D',
                                          border: 'none',
                                          borderRadius: '4px',
                                          padding: '4px 8px',
                                          fontSize: '11px',
                                          fontWeight: 800,
                                          cursor: tDraft.playerId ? 'pointer' : 'not-allowed',
                                          flex: 1,
                                        }}
                                      >
                                        + Goal
                                      </button>
                                      <select
                                        className="form-input"
                                        style={{ fontSize: '10.5px', padding: '3px', width: '70px' }}
                                        onChange={(e) => {
                                          if (!e.target.value) return;
                                          handleAddKoEvent(rIdx, tIdx, { teamId: team.id, playerId: e.target.value, type: 'yellow' });
                                          e.target.value = '';
                                        }}
                                      >
                                        <option value="">+ 🟨</option>
                                        {teamPlayers.map((p) => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                      </select>
                                      <select
                                        className="form-input"
                                        style={{ fontSize: '10.5px', padding: '3px', width: '70px' }}
                                        onChange={(e) => {
                                          if (!e.target.value) return;
                                          handleAddKoEvent(rIdx, tIdx, { teamId: team.id, playerId: e.target.value, type: 'red' });
                                          e.target.value = '';
                                        }}
                                      >
                                        <option value="">+ 🟥</option>
                                        {teamPlayers.map((p) => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Sideline Interference Booking in Knockout Tie */}
                            {otherTeams.length > 0 && (
                              <div style={{ marginTop: '8px', padding: '8px', background: '#092119', border: '1px solid #D97706', borderRadius: '6px' }}>
                                <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#F59E0B', marginBottom: '4px' }}>
                                  🚨 Book Non-Playing Team Player for Interference
                                </div>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  <select
                                    className="form-input"
                                    style={{ fontSize: '11px', padding: '3px', flex: '1 1 120px' }}
                                    value={curInterf.teamId}
                                    onChange={(e) => updateInterfDraft(editorKey, 'teamId', e.target.value)}
                                  >
                                    <option value="">Other Team…</option>
                                    {otherTeams.map((t) => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                  <select
                                    className="form-input"
                                    style={{ fontSize: '11px', padding: '3px', flex: '1 1 130px' }}
                                    value={curInterf.playerId}
                                    disabled={!selectedInterfTeam}
                                    onChange={(e) => updateInterfDraft(editorKey, 'playerId', e.target.value)}
                                  >
                                    <option value="">Offending Player…</option>
                                    {(selectedInterfTeam?.players || []).map((p) => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </select>
                                  <select
                                    className="form-input"
                                    style={{ fontSize: '11px', padding: '3px', width: '100px' }}
                                    value={curInterf.type}
                                    onChange={(e) => updateInterfDraft(editorKey, 'type', e.target.value)}
                                  >
                                    <option value="yellow">🟨 Yellow</option>
                                    <option value="red">🟥 Red</option>
                                  </select>
                                  <button
                                    type="button"
                                    disabled={!curInterf.teamId || !curInterf.playerId}
                                    onClick={() => {
                                      handleAddKoEvent(rIdx, tIdx, {
                                        teamId: curInterf.teamId,
                                        playerId: curInterf.playerId,
                                        type: curInterf.type || 'yellow',
                                        interference: true,
                                      });
                                      setInterfDrafts((prev) => ({ ...prev, [editorKey]: { teamId: '', playerId: '', type: 'yellow' } }));
                                    }}
                                    style={{
                                      background: curInterf.teamId && curInterf.playerId ? '#D97706' : '#2D2817',
                                      color: '#FFF',
                                      border: 'none',
                                      borderRadius: '4px',
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      fontWeight: 800,
                                    }}
                                  >
                                    Book
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Penalty Shootout Inputs */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#8E8E93', marginTop: '8px' }}>
                              <span>Penalties (if tied):</span>
                              <input
                                type="number"
                                min="0"
                                placeholder={homeTeam?.id || 'H'}
                                value={tie.pen?.h ?? ''}
                                onChange={(e) => handleSetKoPens(rIdx, tIdx, 'h', e.target.value)}
                                className="form-input"
                                style={{ width: '56px', padding: '4px 6px', fontSize: '11px' }}
                              />
                              <span>–</span>
                              <input
                                type="number"
                                min="0"
                                placeholder={awayTeam?.id || 'A'}
                                value={tie.pen?.a ?? ''}
                                onChange={(e) => handleSetKoPens(rIdx, tIdx, 'a', e.target.value)}
                                className="form-input"
                                style={{ width: '56px', padding: '4px 6px', fontSize: '11px' }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: GROUP STAGE TABLES & RESPECTIVE GROUP FIXTURES */}
      {(selectedLevel === 'all' || selectedLevel === 'groups') && groupLetters.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
            {groupLetters.map((letter) => {
              const rows = groupTables[letter] || [];
              const gFixtures = (groupFixtures[letter] || []).filter((f) => {
                const isPlayed = Boolean(f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0));
                if (fixtureFilter === 'results') return isPlayed;
                if (fixtureFilter === 'upcoming') return !isPlayed;
                return true;
              });

              return (
                <div
                  key={letter}
                  style={{
                    background: '#121212',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Group Table Header */}
                  <div
                    style={{
                      background: '#121212',
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span className="scoreboard" style={{ fontSize: '20px', color: '#FF9500', letterSpacing: '0.06em' }}>
                      🛡️ GROUP {letter} STANDINGS &amp; FIXTURES
                    </span>
                    <span style={{ fontSize: '11px', color: '#5CD685', fontWeight: 700 }}>
                      Top Qualifiers Advance
                    </span>
                  </div>

                  {/* Group Standings Table */}
                  <div style={{ overflowX: 'auto', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', color: '#FFFFFF' }}>
                      <thead>
                        <tr style={{ color: '#8E8E93', textAlign: 'left', background: '#121212' }}>
                          <th style={{ padding: '8px 12px' }}>Club</th>
                          <th style={{ padding: '6px', textAlign: 'center' }}>P</th>
                          <th style={{ padding: '6px', textAlign: 'center' }}>W</th>
                          <th style={{ padding: '6px', textAlign: 'center' }}>D</th>
                          <th style={{ padding: '6px', textAlign: 'center' }}>L</th>
                          <th style={{ padding: '6px', textAlign: 'center' }}>GD</th>
                          <th style={{ padding: '6px 10px', textAlign: 'center' }}>Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx) => (
                          <tr
                            key={r.id}
                            style={{
                              borderTop: '1px solid #1C1C1E',
                              background: idx < 2 ? 'rgba(34, 197, 94, 0.06)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '11px', color: idx < 2 ? '#5CD685' : '#8E8E93', fontWeight: 700, width: '14px' }}>
                                {idx + 1}
                              </span>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.color }} />
                              {onSelectTeam ? (
                                <button
                                  type="button"
                                  className="team-link-btn"
                                  onClick={() => onSelectTeam(r.id, cupCategoryKey)}
                                  style={{ fontWeight: 700, color: '#FFFFFF' }}
                                  title={`Click to view ${r.name} profile, cup trajectory & odds`}
                                >
                                  {r.name}
                                </button>
                              ) : (
                                <strong>{r.name}</strong>
                              )}
                            </td>
                            <td style={{ padding: '6px', textAlign: 'center' }}>{r.P}</td>
                            <td style={{ padding: '6px', textAlign: 'center' }}>{r.W}</td>
                            <td style={{ padding: '6px', textAlign: 'center' }}>{r.D}</td>
                            <td style={{ padding: '6px', textAlign: 'center' }}>{r.L}</td>
                            <td style={{ padding: '6px', textAlign: 'center' }}>{r.GD > 0 ? `+${r.GD}` : r.GD}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 800, color: '#FF9500' }}>{r.Pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Respective Group Fixtures */}
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Group {letter} Respective Fixtures ({gFixtures.length})
                    </div>

                    {gFixtures.map((f) => {
                      const home = teamsById[f.home];
                      const away = teamsById[f.away];
                      const { hs, as } = computeFixtureScore(f, f.home, f.away);
                      const { homeScorers, awayScorers, interferenceEvents } = formatScorersList(
                        f.events,
                        f.home,
                        f.away
                      );
                      const edKey = `grp-${letter}-${f.id}`;
                      const isEdOpen = !!openEditorIds[edKey];
                      const suspendedList = (suspensions || {})[f.id] || [];

                      const otherTeams = allTeamsList.filter((t) => t.id !== f.home && t.id !== f.away);
                      const curInterf = interfDrafts[edKey] || { teamId: '', playerId: '', type: 'yellow' };
                      const selectedInterfTeam = teamsById[curInterf.teamId];

                      return (
                        <div
                          key={f.id}
                          style={{
                            background: '#09221A',
                            border: '1px solid #1C1C1E',
                            borderRadius: '8px',
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: '#8E8E93', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {showBulkMoveTool && isCmsMode && !f.played && !f.walkover && (
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedForMove[f.id])}
                                  onChange={() => handleToggleSelectForMove(f.id)}
                                  style={{ accentColor: '#FF9500', width: '15px', height: '15px', cursor: 'pointer' }}
                                  title="Select fixture to move date"
                                />
                              )}
                              <span>{f.date || 'TBD'}</span>
                              {f.is_rescheduled && (
                                <span
                                  style={{
                                    background: 'rgba(255, 149, 0, 0.2)',
                                    color: '#FF9F0A',
                                    fontSize: '9.5px',
                                    fontWeight: 800,
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  🗓️ MOVED
                                </span>
                              )}
                            </div>
                            <span style={{ color: f.played ? '#22C55E' : '#F59E0B', fontWeight: 700 }}>
                              {f.played ? 'FINAL RESULT' : 'UPCOMING'}
                            </span>
                          </div>

                          {/* Inline Single Group Fixture Reschedule Panel */}
                          {isCmsMode && movingFixtureId === f.id && (
                            <div
                              className="reschedule-panel"
                              style={{
                                background: '#121212',
                                border: '1px solid #FF9500',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                marginBottom: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#FF9500' }}>
                                  🗓️ Reschedule Match &ldquo;{home?.name || f.home} vs {away?.name || f.away}&rdquo;
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setMovingFixtureId(null)}
                                  style={{ background: 'transparent', border: 'none', color: '#8E8E93', cursor: 'pointer', fontSize: '12px' }}
                                >
                                  ✕
                                </button>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '10.5px', color: '#8E8E93', marginBottom: '2px' }}>
                                    Choose New Date:
                                  </label>
                                  <input
                                    type="date"
                                    className="form-input"
                                    value={moveDateInput}
                                    onChange={(e) => setMoveDateInput(e.target.value)}
                                    style={{ padding: '6px 8px', fontSize: '12px', width: '150px' }}
                                    required
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '10.5px', color: '#8E8E93', marginBottom: '2px' }}>
                                    Kickoff Time:
                                  </label>
                                  <input
                                    type="time"
                                    className="form-input"
                                    value={moveTimeInput}
                                    onChange={(e) => setMoveTimeInput(e.target.value)}
                                    style={{ padding: '6px 8px', fontSize: '12px', width: '110px' }}
                                    required
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmSingleMove(f.id)}
                                  disabled={!moveDateInput}
                                  style={{
                                    background: moveDateInput ? '#FF9500' : '#1C1C1E',
                                    color: moveDateInput ? '#16201B' : '#8E8E93',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '8px 14px',
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                    cursor: moveDateInput ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  Save Date &amp; Time
                                </button>
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: home?.color }} />
                              {onSelectTeam && f.home ? (
                                <button
                                  type="button"
                                  className="team-link-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectTeam(f.home, cupCategoryKey);
                                  }}
                                  style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}
                                  title={`Click to view ${home?.name || f.home} profile, cup trajectory & odds`}
                                >
                                  {home?.name || f.home}
                                </button>
                              ) : (
                                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{home?.name || f.home}</span>
                              )}
                            </div>
                            <div className="scoreboard" style={{ fontSize: '20px', color: f.played ? '#FF9500' : '#8E8E93', padding: '0 10px' }}>
                              {f.played ? `${hs} - ${as}` : 'VS'}
                            </div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                              {onSelectTeam && f.away ? (
                                <button
                                  type="button"
                                  className="team-link-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectTeam(f.away, cupCategoryKey);
                                  }}
                                  style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}
                                  title={`Click to view ${away?.name || f.away} profile, cup trajectory & odds`}
                                >
                                  {away?.name || f.away}
                                </button>
                              ) : (
                                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{away?.name || f.away}</span>
                              )}
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: away?.color }} />
                            </div>
                          </div>

                          {(homeScorers.length > 0 || awayScorers.length > 0) && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#8E8E93', marginTop: '4px' }}>
                              <div>{homeScorers.join(', ')}</div>
                              <div style={{ textAlign: 'right' }}>{awayScorers.join(', ')}</div>
                            </div>
                          )}

                          {interferenceEvents.length > 0 && (
                            <div style={{ marginTop: '4px', padding: '3px 6px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '4px', fontSize: '10.5px', color: '#FF9F0A' }}>
                              🚨 <strong>Interference:</strong> {interferenceEvents.map((ev, i) => `${ev.type === 'red' ? '🟥' : '🟨'} ${ev.player} (${ev.teamName})`).join(', ')}
                            </div>
                          )}

                          {suspendedList.length > 0 && (
                            <div style={{ marginTop: '4px', textAlign: 'center', fontSize: '10.5px', color: '#FF8A80', background: 'rgba(226, 74, 59, 0.12)', border: '1px solid rgba(226, 74, 59, 0.35)', borderRadius: '4px', padding: '3px 6px' }}>
                              🚫 <strong>Suspended:</strong> {suspendedList.map((s) => `${s.playerName} (${teamsById[s.teamId]?.name || s.teamId} — ${s.reason})`).join(' · ')}
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                            {isCmsMode && !f.played && !f.walkover ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '11px', color: '#FF9500' }}>🧑‍⚖️</span>
                                <select
                                  className="form-input"
                                  style={{ fontSize: '11px', padding: '2px 6px', height: '24px', minWidth: '120px' }}
                                  value={f.referee || ''}
                                  onChange={(e) => handleSetGroupReferee(letter, f.id, e.target.value)}
                                >
                                  <option value="">Assign Referee...</option>
                                  {referees.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <span style={{ fontSize: '10.5px', color: '#8E8E93' }}>
                                🧑‍⚖️ {f.referee || 'Official TBD'}
                              </span>
                            )}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {home && away && onOpenH2H && (
                                <button type="button" className="btn-pill-action" onClick={() => onOpenH2H(home.id, away.id)}>
                                  ⚔️ H2H
                                </button>
                              )}
                              <a href={`/fixtures/${f.id}/sheet/`} target="_blank" rel="noreferrer" className="btn-pill-action">
                                📄 Sheet
                              </a>
                              {isCmsMode && !f.played && !f.walkover && onMoveFixture && (
                                <button
                                  type="button"
                                  className="btn-pill-action"
                                  onClick={() => {
                                    setMovingFixtureId(movingFixtureId === f.id ? null : f.id);
                                    setMoveDateInput('');
                                  }}
                                  style={{
                                    background: movingFixtureId === f.id ? '#FF9500' : '#1C1C1E',
                                    color: movingFixtureId === f.id ? '#16201B' : '#EBEBF5',
                                    borderColor: '#2F7D5C',
                                  }}
                                  title="Move this match to another date and time"
                                >
                                  🗓️ Move Date
                                </button>
                              )}
                              {isCmsMode && (
                                <button
                                  type="button"
                                  className="btn-pill-action"
                                  onClick={() => toggleEditor(edKey)}
                                  style={{ borderColor: '#FF9500', color: '#FF9500' }}
                                >
                                  {isEdOpen ? 'Close ▲' : '✏️ Edit'}
                                </button>
                              )}
                            </div>
                          </div>

                          {isCmsMode && isEdOpen && (
                            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #1C1C1E' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '11px', color: '#FF9500', fontWeight: 700 }}>Record Group Match Events</span>
                                <button
                                  type="button"
                                  className="played-toggle"
                                  style={{ padding: '3px 8px', fontSize: '11px' }}
                                  onClick={() => handleToggleGroupPlayed(letter, f.id)}
                                >
                                  {f.played ? '✓ Final' : 'Mark Final'}
                                </button>
                              </div>

                              <div style={{ marginBottom: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {(f.events || []).map((ev, evIdx) => {
                                  const t = teamsById[ev.teamId];
                                  const p = t?.players?.find((pp) => pp.id === ev.playerId);
                                  const a = ev.assistPlayerId ? t?.players?.find((pp) => pp.id === ev.assistPlayerId) : null;
                                  let lbl = `${p?.name || 'Goal'} (${t?.id || ev.teamId})`;
                                  if (ev.type === 'goal') {
                                    if (ev.penalty) lbl += ' [Pen]';
                                    if (a) lbl += ` [🅰️ ${a.name}]`;
                                  } else if (ev.type === 'owngoal') {
                                    lbl += ' [OG]';
                                  }
                                  return (
                                    <span key={evIdx} className="ev-chip">
                                      <span>{ev.type === 'goal' ? (ev.penalty ? '🎯⚽' : '⚽') : ev.type === 'owngoal' ? '🥅' : ev.type === 'yellow' ? '🟨' : '🟥'}</span>
                                      <span>{lbl}</span>
                                      <span className="ev-remove" onClick={() => handleRemoveGroupEvent(letter, f.id, evIdx)}>✕</span>
                                    </span>
                                  );
                                })}
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px', marginBottom: '6px' }}>
                                {[home, away].filter(Boolean).map((team) => {
                                  const tDraft = goalDrafts[edKey]?.[team.id] || { playerId: '', type: 'goal', assistPlayerId: '' };
                                  const teamPlayers = team.players || [];
                                  const assistCandidates = teamPlayers.filter((p) => p.id !== tDraft.playerId && !p.unknown);

                                  return (
                                    <div key={team.id} style={{ background: '#121212', padding: '6px', borderRadius: '6px' }}>
                                      <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#FF9500', marginBottom: '3px' }}>
                                        {team.name}
                                      </div>
                                      <select
                                        className="form-input"
                                        style={{ fontSize: '11px', padding: '3px', marginBottom: '3px' }}
                                        value={tDraft.playerId}
                                        onChange={(e) => updateGoalDraft(edKey, team.id, 'playerId', e.target.value)}
                                      >
                                        <option value="">Scorer…</option>
                                        {teamPlayers.map((p) => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                      </select>
                                      <div style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
                                        <select
                                          className="form-input"
                                          style={{ fontSize: '10.5px', padding: '2px', flex: 1 }}
                                          value={tDraft.type}
                                          onChange={(e) => updateGoalDraft(edKey, team.id, 'type', e.target.value)}
                                        >
                                          <option value="goal">⚽ Regular</option>
                                          <option value="penalty">🎯 Penalty</option>
                                          <option value="owngoal">🥅 Own Goal</option>
                                        </select>
                                        {tDraft.type === 'goal' && (
                                          <select
                                            className="form-input"
                                            style={{ fontSize: '10.5px', padding: '2px', flex: 1 }}
                                            value={tDraft.assistPlayerId}
                                            onChange={(e) => updateGoalDraft(edKey, team.id, 'assistPlayerId', e.target.value)}
                                          >
                                            <option value="">🅰️ Unassisted</option>
                                            {assistCandidates.map((p) => (
                                              <option key={p.id} value={p.id}>Assist: {p.name}</option>
                                            ))}
                                          </select>
                                        )}
                                      </div>
                                      <div style={{ display: 'flex', gap: '3px' }}>
                                        <button
                                          type="button"
                                          disabled={!tDraft.playerId}
                                          onClick={() => {
                                            handleAddGroupEvent(letter, f.id, {
                                              teamId: team.id,
                                              playerId: tDraft.playerId,
                                              type: tDraft.type === 'owngoal' ? 'owngoal' : 'goal',
                                              ...(tDraft.type === 'penalty' ? { penalty: true } : {}),
                                              ...(tDraft.type === 'goal' && tDraft.assistPlayerId ? { assistPlayerId: tDraft.assistPlayerId } : {}),
                                            });
                                            updateGoalDraft(edKey, team.id, 'playerId', '');
                                            updateGoalDraft(edKey, team.id, 'assistPlayerId', '');
                                          }}
                                          style={{
                                            background: tDraft.playerId ? '#FF9500' : '#1B3D30',
                                            color: tDraft.playerId ? '#16201B' : '#5C7A6D',
                                            border: 'none',
                                            borderRadius: '4px',
                                            padding: '3px 6px',
                                            fontSize: '10.5px',
                                            fontWeight: 800,
                                            flex: 1,
                                          }}
                                        >
                                          + Goal
                                        </button>
                                        <select
                                          className="form-input"
                                          style={{ fontSize: '10.5px', padding: '2px', width: '60px' }}
                                          onChange={(e) => {
                                            if (!e.target.value) return;
                                            handleAddGroupEvent(letter, f.id, { teamId: team.id, playerId: e.target.value, type: 'yellow' });
                                            e.target.value = '';
                                          }}
                                        >
                                          <option value="">+ 🟨</option>
                                          {teamPlayers.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                          ))}
                                        </select>
                                        <select
                                          className="form-input"
                                          style={{ fontSize: '10.5px', padding: '2px', width: '60px' }}
                                          onChange={(e) => {
                                            if (!e.target.value) return;
                                            handleAddGroupEvent(letter, f.id, { teamId: team.id, playerId: e.target.value, type: 'red' });
                                            e.target.value = '';
                                          }}
                                        >
                                          <option value="">+ 🟥</option>
                                          {teamPlayers.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {otherTeams.length > 0 && (
                                <div style={{ padding: '6px', background: '#092119', border: '1px solid #D97706', borderRadius: '6px' }}>
                                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#F59E0B', marginBottom: '3px' }}>
                                    🚨 Book Non-Playing Team Player for Interference
                                  </div>
                                  <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                    <select
                                      className="form-input"
                                      style={{ fontSize: '10.5px', padding: '2px', flex: '1 1 100px' }}
                                      value={curInterf.teamId}
                                      onChange={(e) => updateInterfDraft(edKey, 'teamId', e.target.value)}
                                    >
                                      <option value="">Other Team…</option>
                                      {otherTeams.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                    </select>
                                    <select
                                      className="form-input"
                                      style={{ fontSize: '10.5px', padding: '2px', flex: '1 1 110px' }}
                                      value={curInterf.playerId}
                                      disabled={!selectedInterfTeam}
                                      onChange={(e) => updateInterfDraft(edKey, 'playerId', e.target.value)}
                                    >
                                      <option value="">Offending Player…</option>
                                      {(selectedInterfTeam?.players || []).map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                      ))}
                                    </select>
                                    <select
                                      className="form-input"
                                      style={{ fontSize: '10.5px', padding: '2px', width: '80px' }}
                                      value={curInterf.type}
                                      onChange={(e) => updateInterfDraft(edKey, 'type', e.target.value)}
                                    >
                                      <option value="yellow">🟨</option>
                                      <option value="red">🟥</option>
                                    </select>
                                    <button
                                      type="button"
                                      disabled={!curInterf.teamId || !curInterf.playerId}
                                      onClick={() => {
                                        handleAddGroupEvent(letter, f.id, {
                                          teamId: curInterf.teamId,
                                          playerId: curInterf.playerId,
                                          type: curInterf.type || 'yellow',
                                          interference: true,
                                        });
                                        setInterfDrafts((prev) => ({ ...prev, [edKey]: { teamId: '', playerId: '', type: 'yellow' } }));
                                      }}
                                      style={{
                                        background: curInterf.teamId && curInterf.playerId ? '#D97706' : '#2D2817',
                                        color: '#FFF',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        fontSize: '10.5px',
                                        fontWeight: 800,
                                      }}
                                    >
                                      Book
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
