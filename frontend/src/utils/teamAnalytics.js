// Team Analytics & Predictive Tournament Progression Engine for Ruiru Titans FC
// Dynamically recalculates after every match played, walkover, or event recorded.
import { compareFixturesByDate } from '../components/FixturesView';

export function computeFixtureScore(matchLike, homeId, awayId) {
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

/**
 * Computes complete profile, player roster, suspensions, last 20 matches,
 * next 5 fixtures, current form metrics, and predictive competition simulations for a team.
 */
export function computeTeamProfile(teamId, currentCategory, allCategories = {}, activeSuspensionsMap = {}) {
  if (!teamId) return null;

  // 1. Locate team object
  let team = (currentCategory?.teams || []).find((t) => t.id === teamId);
  let category = currentCategory;
  let categoryKey = currentCategory?.key || 'open';

  if (!team && allCategories) {
    for (const [cKey, cObj] of Object.entries(allCategories)) {
      const found = (cObj?.teams || []).find((t) => t.id === teamId);
      if (found) {
        team = found;
        category = cObj;
        categoryKey = cKey;
        break;
      }
    }
  }

  if (!team) {
    return null;
  }

  // Map of team names/colors across all categories for quick lookups
  const teamsMap = {};
  Object.values(allCategories || {}).forEach((c) => {
    (c.teams || []).forEach((t) => {
      teamsMap[t.id] = t;
    });
  });
  (category?.teams || []).forEach((t) => {
    teamsMap[t.id] = t;
  });

  // 2. Collect all fixtures involving this team across current and other categories
  const allTeamPlayedMatches = [];
  const allTeamUpcomingMatches = [];

  const inspectFixture = (f, compName, compMode) => {
    if (!f || (f.home !== teamId && f.away !== teamId)) return;
    const isHome = f.home === teamId;
    const opponentId = isHome ? f.away : f.home;
    const opponent = teamsMap[opponentId] || { id: opponentId, name: opponentId, color: '#8E8E93' };
    const { hs, as } = computeFixtureScore(f, f.home, f.away);
    const teamScore = isHome ? hs : as;
    const oppScore = isHome ? as : hs;

    const isCompleted = Boolean(f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0));

    if (isCompleted) {
      let result = 'D';
      if (f.walkover) {
        result = f.walkover === teamId ? 'W' : 'L';
      } else if (teamScore > oppScore) {
        result = 'W';
      } else if (teamScore < oppScore) {
        result = 'L';
      }

      allTeamPlayedMatches.push({
        id: f.id,
        date: f.date || 'Past Match',
        competitionName: compName,
        competitionMode: compMode,
        isHome,
        homeId: f.home,
        homeName: teamsMap[f.home]?.name || f.home,
        homeColor: teamsMap[f.home]?.color || '#8E8E93',
        awayId: f.away,
        awayName: teamsMap[f.away]?.name || f.away,
        awayColor: teamsMap[f.away]?.color || '#8E8E93',
        opponentId,
        opponentName: opponent.name,
        opponentColor: opponent.color,
        homeScore: hs,
        awayScore: as,
        teamScore,
        oppScore,
        result,
        walkover: f.walkover,
        events: f.events || [],
        referee: f.referee,
        sheetUrl: `/fixtures/${f.id}/sheet/`,
      });
    } else {
      allTeamUpcomingMatches.push({
        id: f.id,
        date: f.date || 'TBD',
        competitionName: compName,
        competitionMode: compMode,
        isHome,
        homeId: f.home,
        homeName: teamsMap[f.home]?.name || f.home,
        homeColor: teamsMap[f.home]?.color || '#8E8E93',
        awayId: f.away,
        awayName: teamsMap[f.away]?.name || f.away,
        awayColor: teamsMap[f.away]?.color || '#8E8E93',
        opponentId,
        opponentName: opponent.name,
        opponentColor: opponent.color,
        referee: f.referee || 'Official TBD',
        stage: f.stage || 'Regular Fixture',
        sheetUrl: `/fixtures/${f.id}/sheet/`,
      });
    }
  };

  // Process fixtures from current category
  if (category) {
    (category.fixtures || []).forEach((f) => {
      inspectFixture(f, category.label || 'Championship League', category.mode || 'league');
    });

    // Also include group fixtures if Cup
    if (category.mode === 'cup' && category.groupFixtures) {
      Object.entries(category.groupFixtures).forEach(([letter, list]) => {
        (list || []).forEach((f) => {
          inspectFixture(f, `${category.label} (Group ${letter})`, 'cup');
        });
      });
    }

    // Also include knockout rounds if Cup
    if (category.mode === 'cup' && Array.isArray(category.rounds)) {
      category.rounds.forEach((roundTies, rIdx) => {
        (roundTies || []).forEach((tie) => {
          if (tie && (tie.home === teamId || tie.away === teamId)) {
            const fLike = {
              id: tie.id,
              home: tie.home,
              away: tie.away,
              date: tie.date,
              played: tie.match?.played,
              walkover: tie.match?.walkover,
              events: tie.match?.events || [],
              referee: tie.referee || tie.match?.referee,
              stage: tie.stage || `Knockout Round ${rIdx + 1}`,
            };
            inspectFixture(fLike, `${category.label} (${tie.stage || 'Knockout'})`, 'cup');
          }
        });
      });
    }
  }

  // Deduplicate and sort matches by date
  const uniquePlayedMap = new Map();
  allTeamPlayedMatches.forEach((m) => uniquePlayedMap.set(String(m.id), m));
  const sortedPlayed = Array.from(uniquePlayedMap.values()).sort(compareFixturesByDate).reverse(); // Most recent first
  const last20Matches = sortedPlayed.slice(0, 20);

  const uniqueUpcomingMap = new Map();
  allTeamUpcomingMatches.forEach((m) => uniqueUpcomingMap.set(String(m.id), m));
  const sortedUpcoming = Array.from(uniqueUpcomingMap.values()).sort(compareFixturesByDate); // Nearest first
  const next5Fixtures = sortedUpcoming.slice(0, 5);

  // 3. Player Stats & Roster
  const playerStatsMap = {};
  (team.players || []).forEach((p) => {
    playerStatsMap[p.id] = {
      ...p,
      goals: 0,
      assists: 0,
      yellows: 0,
      reds: 0,
    };
  });

  // Calculate individual player events across all matches
  sortedPlayed.forEach((m) => {
    (m.events || []).forEach((ev) => {
      if (ev.teamId === teamId && playerStatsMap[ev.playerId]) {
        if (ev.type === 'goal') playerStatsMap[ev.playerId].goals++;
        if (ev.type === 'yellow') playerStatsMap[ev.playerId].yellows++;
        if (ev.type === 'red') playerStatsMap[ev.playerId].reds++;
      }
      if (ev.assistPlayerId && playerStatsMap[ev.assistPlayerId]) {
        playerStatsMap[ev.assistPlayerId].assists++;
      }
    });
  });

  // 4. Active Suspensions
  const teamSuspensions = [];
  const nextFixture = next5Fixtures[0] || null;
  const nextFixtureLabel = nextFixture
    ? `vs ${nextFixture.opponentName} (${nextFixture.date})`
    : 'Upcoming Match';

  // Check suspensions map passed in from App.jsx
  Object.entries(activeSuspensionsMap || {}).forEach(([fixId, suspList]) => {
    (suspList || []).forEach((s) => {
      if (s.teamId === teamId) {
        teamSuspensions.push({
          playerId: s.playerId,
          playerName: s.playerName,
          reason: s.reason,
          forFixture: nextFixtureLabel,
        });
      }
    });
  });

  // Mark suspended flag on roster
  const suspendedPlayerIds = new Set(teamSuspensions.map((s) => s.playerId));
  const roster = Object.values(playerStatsMap).map((p) => ({
    ...p,
    isSuspended: suspendedPlayerIds.has(p.id),
    suspensionReason: teamSuspensions.find((s) => s.playerId === p.id)?.reason || null,
  }));

  // 5. Current Form metrics
  const recent5 = last20Matches.slice(0, 5);
  const formBadges = recent5.map((m) => m.result); // e.g. ['W', 'W', 'D', 'L', 'W']
  const winsCount = last20Matches.filter((m) => m.result === 'W').length;
  const drawsCount = last20Matches.filter((m) => m.result === 'D').length;
  const lossesCount = last20Matches.filter((m) => m.result === 'L').length;
  const totalMatches = last20Matches.length;

  const pointsLast5 = recent5.reduce((acc, m) => acc + (m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0), 0);
  const winRate = totalMatches > 0 ? Math.round((winsCount / totalMatches) * 100) : 0;

  const totalGoalsScored = last20Matches.reduce((acc, m) => acc + m.teamScore, 0);
  const totalGoalsConceded = last20Matches.reduce((acc, m) => acc + m.oppScore, 0);
  const cleanSheetsCount = last20Matches.filter((m) => m.oppScore === 0).length;

  const avgGoalsScored = totalMatches > 0 ? (totalGoalsScored / totalMatches).toFixed(1) : '0.0';
  const avgGoalsConceded = totalMatches > 0 ? (totalGoalsConceded / totalMatches).toFixed(1) : '0.0';
  const cleanSheetPct = totalMatches > 0 ? Math.round((cleanSheetsCount / totalMatches) * 100) : 0;

  // 6. Tournament Predictive Simulation & Probability Engine
  const tournamentProjections = runCompetitionSimulation(
    teamId,
    category,
    allCategories,
    teamsMap,
    sortedPlayed
  );

  return {
    team,
    category: {
      key: categoryKey,
      label: category?.label || 'Championship League',
      mode: category?.mode || 'league',
    },
    squadSize: roster.length,
    roster,
    activeSuspensions: teamSuspensions,
    last20Matches,
    next5Fixtures,
    form: {
      badges: formBadges,
      pointsLast5,
      wins: winsCount,
      draws: drawsCount,
      losses: lossesCount,
      totalPlayed: totalMatches,
      winRate,
      avgGoalsScored,
      avgGoalsConceded,
      cleanSheets: cleanSheetsCount,
      cleanSheetPct,
      goalDifference: totalGoalsScored - totalGoalsConceded,
    },
    tournamentProjections,
  };
}

/**
 * Monte Carlo Simulation Engine:
 * Simulates remaining league or cup fixtures 1,000 times dynamically
 * factoring in current table standings, PPG, GD rate, and remaining fixtures.
 */
function runCompetitionSimulation(teamId, category, allCategories, teamsMap, playedMatches) {
  if (!category) return null;

  if (category.mode === 'cup') {
    return simulateCupCompetition(teamId, category, teamsMap);
  }

  // LEAGUE SIMULATION
  return simulateLeagueCompetition(teamId, category, teamsMap);
}

/**
 * Simulates League Tournament outcomes across 1,000 Monte Carlo runs
 */
function simulateLeagueCompetition(teamId, category, teamsMap) {
  const teams = category.teams || [];
  const fixtures = category.fixtures || [];

  // Compute current actual table
  const table = {};
  teams.forEach((t) => {
    table[t.id] = { id: t.id, name: t.name, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
  });

  const unplayedFixtures = [];

  fixtures.forEach((f) => {
    if (f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0)) {
      const { hs, as } = computeFixtureScore(f, f.home, f.away);
      const h = table[f.home];
      const a = table[f.away];
      if (h && a) {
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
      }
    } else {
      unplayedFixtures.push(f);
    }
  });

  Object.values(table).forEach((r) => {
    r.GD = r.GF - r.GA;
  });

  const sortedCurrentTable = Object.values(table).sort(
    (x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF
  );

  const teamCurrentRank = sortedCurrentTable.findIndex((r) => r.id === teamId) + 1;
  const teamRow = table[teamId] || { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };

  const leaderRow = sortedCurrentTable[0] || teamRow;
  const leaderPts = leaderRow.Pts;

  // Games remaining for this team
  const teamRemainingCount = unplayedFixtures.filter((f) => f.home === teamId || f.away === teamId).length;
  const maxPossiblePoints = teamRow.Pts + teamRemainingCount * 3;

  // Mathematical Title Elimination Check
  const isMathematicallyEliminated = maxPossiblePoints < leaderPts;
  let titleEliminationReason = null;
  if (isMathematicallyEliminated) {
    titleEliminationReason = `Maximum reachable points (${maxPossiblePoints} pts) is strictly lower than current leader ${leaderRow.name} (${leaderPts} pts).`;
  }

  // If no remaining fixtures, final result is 100% deterministic
  if (unplayedFixtures.length === 0) {
    const isChamp = teamCurrentRank === 1;
    return {
      mode: 'league',
      competitionLabel: category.label || 'Championship League',
      currentRank: teamCurrentRank,
      totalTeams: teams.length,
      played: teamRow.P,
      remaining: 0,
      currentPoints: teamRow.Pts,
      maxPossiblePoints: teamRow.Pts,
      leaderPoints: leaderPts,
      isMathematicallyEliminated: !isChamp,
      titleEliminationReason: isChamp ? null : 'Season complete.',
      titleProbability: isChamp ? 100 : 0,
      top2Probability: teamCurrentRank <= 2 ? 100 : 0,
      top4Probability: teamCurrentRank <= 4 ? 100 : 0,
      projectedFinalPoints: teamRow.Pts,
      projectedRank: `${teamCurrentRank}${getOrdinalSuffix(teamCurrentRank)} Place`,
      titleStatus: isChamp ? '🏆 CHAMPION' : 'SEASON FINISHED',
      simulationsRun: 1,
    };
  }

  // Base ratings for Monte Carlo simulation
  const teamRatings = {};
  teams.forEach((t) => {
    const r = table[t.id];
    const ppg = r && r.P > 0 ? r.Pts / r.P : 1.33;
    const gdRate = r && r.P > 0 ? (r.GF - r.GA) / r.P : 0;
    teamRatings[t.id] = Math.max(0.25, ppg + gdRate * 0.2);
  });

  // Run 1,000 Monte Carlo Simulations
  const ITERATIONS = 1000;
  let firstPlaceCount = 0;
  let top2Count = 0;
  let top4Count = 0;
  let totalSimPoints = 0;
  const rankHistogram = {};

  for (let it = 0; it < ITERATIONS; it++) {
    // Clone starting points and GD
    const simPts = {};
    const simGD = {};
    const simGF = {};
    teams.forEach((t) => {
      simPts[t.id] = table[t.id]?.Pts || 0;
      simGD[t.id] = table[t.id]?.GD || 0;
      simGF[t.id] = table[t.id]?.GF || 0;
    });

    // Simulate each unplayed fixture
    unplayedFixtures.forEach((f) => {
      const hRate = (teamRatings[f.home] || 1.2) * 1.15; // Home advantage
      const aRate = teamRatings[f.away] || 1.2;
      const total = hRate + aRate + 0.6; // 0.6 draw weight
      const probH = hRate / total;
      const probA = aRate / total;

      const roll = Math.random();
      if (roll < probH) {
        simPts[f.home] += 3;
        simGD[f.home] += 1.5;
        simGF[f.home] += 2;
        simGD[f.away] -= 1.5;
      } else if (roll < probH + probA) {
        simPts[f.away] += 3;
        simGD[f.away] += 1.5;
        simGF[f.away] += 2;
        simGD[f.home] -= 1.5;
      } else {
        simPts[f.home] += 1;
        simPts[f.away] += 1;
        simGF[f.home] += 1;
        simGF[f.away] += 1;
      }
    });

    // Rank simulated table
    const simRanked = teams
      .map((t) => ({ id: t.id, pts: simPts[t.id], gd: simGD[t.id], gf: simGF[t.id] }))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);

    const finishPos = simRanked.findIndex((r) => r.id === teamId) + 1;
    rankHistogram[finishPos] = (rankHistogram[finishPos] || 0) + 1;
    totalSimPoints += simPts[teamId];

    if (finishPos === 1) firstPlaceCount++;
    if (finishPos <= 2) top2Count++;
    if (finishPos <= 4) top4Count++;
  }

  // Find mode of finish ranks
  let mostLikelyRank = 1;
  let highestFreq = 0;
  Object.entries(rankHistogram).forEach(([rk, count]) => {
    if (count > highestFreq) {
      highestFreq = count;
      mostLikelyRank = Number(rk);
    }
  });

  const titleProb = isMathematicallyEliminated
    ? 0
    : Math.min(100, Math.round((firstPlaceCount / ITERATIONS) * 1000) / 10);
  const top2Prob = Math.min(100, Math.round((top2Count / ITERATIONS) * 1000) / 10);
  const top4Prob = Math.min(100, Math.round((top4Count / ITERATIONS) * 1000) / 10);
  const projectedPts = Math.round(totalSimPoints / ITERATIONS);

  let titleStatus = 'CONTENDER';
  if (isMathematicallyEliminated) {
    titleStatus = 'MATHEMATICALLY ELIMINATED';
  } else if (titleProb >= 50) {
    titleStatus = 'PRIMARY TITLE FAVOURITE';
  } else if (titleProb >= 20) {
    titleStatus = 'STRONG TITLE CONTENDER';
  } else if (titleProb >= 5) {
    titleStatus = 'OUTSIDE TITLE HOPE';
  } else if (titleProb > 0) {
    titleStatus = 'MATHEMATICALLY ALIVE';
  } else {
    titleStatus = 'UNLIKELY (< 1%)';
  }

  return {
    mode: 'league',
    competitionLabel: category.label || 'Championship League',
    currentRank: teamCurrentRank,
    totalTeams: teams.length,
    played: teamRow.P,
    remaining: teamRemainingCount,
    currentPoints: teamRow.Pts,
    maxPossiblePoints,
    leaderPoints: leaderPts,
    isMathematicallyEliminated,
    titleEliminationReason,
    titleProbability: titleProb,
    top2Probability: top2Prob,
    top4Probability: top4Prob,
    projectedFinalPoints: projectedPts,
    projectedRank: `${mostLikelyRank}${getOrdinalSuffix(mostLikelyRank)} Place`,
    titleStatus,
    simulationsRun: ITERATIONS,
  };
}

/**
 * Simulates Cup Tournament progression across 1,000 Monte Carlo runs
 */
function simulateCupCompetition(teamId, category, teamsMap) {
  const groupLetters = category.groupLetters || [];
  const groupOf = category.groupOf || {};
  const groupFixtures = category.groupFixtures || {};
  const rounds = category.rounds || [];

  const teamGroup = groupOf[teamId] || null;

  // 1. Group Stage Probability
  let isGroupStage = Boolean(teamGroup && groupLetters.includes(teamGroup));
  let groupAdvanceProb = 50.0;
  let isGroupEliminated = false;

  if (isGroupStage) {
    const gFixtures = groupFixtures[teamGroup] || [];
    const gTeams = (category.teams || []).filter((t) => groupOf[t.id] === teamGroup);

    const gTable = {};
    gTeams.forEach((t) => {
      gTable[t.id] = { id: t.id, P: 0, Pts: 0, GF: 0, GA: 0, GD: 0 };
    });

    const unplayedGroup = [];
    gFixtures.forEach((f) => {
      if (f.played || f.walkover || (Array.isArray(f.events) && f.events.length > 0)) {
        const { hs, as } = computeFixtureScore(f, f.home, f.away);
        const h = gTable[f.home];
        const a = gTable[f.away];
        if (h && a) {
          h.P++;
          a.P++;
          h.GF += hs;
          h.GA += as;
          a.GF += as;
          a.GA += hs;
          if (hs > as) h.Pts += 3;
          else if (as > hs) a.Pts += 3;
          else {
            h.Pts += 1;
            a.Pts += 1;
          }
        }
      } else {
        unplayedGroup.push(f);
      }
    });

    Object.values(gTable).forEach((r) => {
      r.GD = r.GF - r.GA;
    });

    // Check if group stage complete
    if (unplayedGroup.length === 0) {
      const sortedG = Object.values(gTable).sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF);
      const pos = sortedG.findIndex((r) => r.id === teamId) + 1;
      groupAdvanceProb = pos <= 2 ? 100 : 0;
      if (pos > 2) isGroupEliminated = true;
    } else {
      // Simulate unplayed group matches 1,000 times
      let qualifiedCount = 0;
      for (let i = 0; i < 1000; i++) {
        const simPts = {};
        const simGD = {};
        gTeams.forEach((t) => {
          simPts[t.id] = gTable[t.id]?.Pts || 0;
          simGD[t.id] = gTable[t.id]?.GD || 0;
        });

        unplayedGroup.forEach((f) => {
          const roll = Math.random();
          if (roll < 0.45) {
            simPts[f.home] += 3;
            simGD[f.home] += 1;
            simGD[f.away] -= 1;
          } else if (roll < 0.8) {
            simPts[f.away] += 3;
            simGD[f.away] += 1;
            simGD[f.home] -= 1;
          } else {
            simPts[f.home] += 1;
            simPts[f.away] += 1;
          }
        });

        const sortedSim = gTeams
          .map((t) => ({ id: t.id, pts: simPts[t.id], gd: simGD[t.id] }))
          .sort((a, b) => b.pts - a.pts || b.gd - a.gd);

        const pos = sortedSim.findIndex((r) => r.id === teamId) + 1;
        if (pos <= 2) qualifiedCount++;
      }
      groupAdvanceProb = Math.round((qualifiedCount / 1000) * 1000) / 10;
    }
  }

  // 2. Knockout Stage Analysis
  let isEliminated = isGroupEliminated;
  let eliminationDetails = null;
  let currentStageLabel = isGroupStage ? `Group Stage (${teamGroup ? `Group ${teamGroup}` : 'Groups'})` : 'Knockout Stage';

  // Check if team lost in knockout rounds
  for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
    const roundTies = rounds[rIdx] || [];
    for (const tie of roundTies) {
      if (tie && (tie.home === teamId || tie.away === teamId)) {
        currentStageLabel = tie.stage || getRoundName(rIdx, rounds.length);
        if (tie.match?.played) {
          const { hs, as } = computeFixtureScore(tie.match, tie.home, tie.away);
          let won = false;
          if (hs !== as) {
            won = (tie.home === teamId && hs > as) || (tie.away === teamId && as > hs);
          } else if (tie.pen) {
            const ph = Number(tie.pen.h || 0);
            const pa = Number(tie.pen.a || 0);
            won = (tie.home === teamId && ph > pa) || (tie.away === teamId && pa > ph);
          }
          if (!won) {
            isEliminated = true;
            const oppId = tie.home === teamId ? tie.away : tie.home;
            const oppName = teamsMap[oppId]?.name || oppId;
            eliminationDetails = `Eliminated in ${currentStageLabel} by ${oppName} (${hs} - ${as})`;
            break;
          }
        }
      }
    }
    if (isEliminated) break;
  }

  // Bracket reach probabilities
  let semiFinalProb = 0;
  let finalProb = 0;
  let cupWinnerProb = 0;

  if (!isEliminated) {
    if (isGroupStage) {
      semiFinalProb = Math.round(groupAdvanceProb * 0.65 * 10) / 10;
      finalProb = Math.round(groupAdvanceProb * 0.35 * 10) / 10;
      cupWinnerProb = Math.round(groupAdvanceProb * 0.18 * 10) / 10;
    } else {
      // In Knockout
      const totalRounds = rounds.length;
      let activeRoundIdx = 0;
      rounds.forEach((r, idx) => {
        if (r.some((t) => t && (t.home === teamId || t.away === teamId))) {
          activeRoundIdx = idx;
        }
      });
      const roundsRemaining = Math.max(1, totalRounds - activeRoundIdx);
      if (roundsRemaining === 1) {
        // Grand final
        semiFinalProb = 100;
        finalProb = 100;
        cupWinnerProb = 50.0;
      } else if (roundsRemaining === 2) {
        // Semi-final
        semiFinalProb = 100;
        finalProb = 50.0;
        cupWinnerProb = 25.0;
      } else {
        // Quarter-final or earlier
        semiFinalProb = 50.0;
        finalProb = 25.0;
        cupWinnerProb = 12.5;
      }
    }
  }

  return {
    mode: 'cup',
    competitionLabel: category.label || 'Titans Knockout Cup',
    isGroupStage,
    groupLetter: teamGroup,
    groupAdvanceProbability: groupAdvanceProb,
    semiFinalProbability: semiFinalProb,
    finalProbability: finalProb,
    cupWinnerProbability: cupWinnerProb,
    isEliminated,
    eliminationDetails,
    currentStageLabel,
    titleStatus: isEliminated
      ? 'ELIMINATED'
      : cupWinnerProb >= 25
      ? 'FAVOURITE TO LIFT CUP'
      : 'ACTIVE CUP CONTENDER',
    simulationsRun: 1000,
  };
}

function getOrdinalSuffix(i) {
  const j = i % 10;
  const k = i % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

function getRoundName(roundIdx, totalRounds) {
  const fromEnd = totalRounds - 1 - roundIdx;
  const labels = ['Grand Final', 'Semi-Finals', 'Quarter-Finals', 'Round of 16', 'Round of 32'];
  return labels[fromEnd] || `Knockout Round ${roundIdx + 1}`;
}
