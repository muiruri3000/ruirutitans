import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { DEFAULT_VOTING_DATA } from '../data/defaultState';

const POSITIONS = [
  { key: 'GK', name: 'Goalkeeper (GK)', icon: '🧤', pitchRow: 'gk', optional: true },
  { key: 'LB', name: 'Left Back (LB)', icon: '🛡️', pitchRow: 'def', optional: false },
  { key: 'CB', name: 'Center Back (CB)', icon: '🛡️', pitchRow: 'def', optional: false },
  { key: 'RB', name: 'Right Back (RB)', icon: '🛡️', pitchRow: 'def', optional: false },
  { key: 'CDM', name: 'Defensive Midfielder (CDM)', icon: '⚙️', pitchRow: 'mid', optional: false },
  { key: 'CM', name: 'Central Midfielder (CM)', icon: '⚙️', pitchRow: 'mid', optional: false },
  { key: 'LW', name: 'Left Winger (LW)', icon: '⚡', pitchRow: 'att', optional: false },
  { key: 'RW', name: 'Right Winger (RW)', icon: '⚡', pitchRow: 'att', optional: false },
  { key: 'ST', name: 'Striker (ST)', icon: '🎯', pitchRow: 'att', optional: false },
];

export default function VotingView({
  activeCategoryKey,
  categories = {},
  onSelectCategory,
  playerUser = null,
  cmsUser = null,
  isCmsMode = false,
  initialSubTab = 'totw',
  onRequestPlayerLogin,
  onVotingDataUpdated,
}) {
  const [subTab, setSubTab] = useState(initialSubTab); // 'totw' | 'tott' | 'ballot' | 'admin'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [votingData, setVotingData] = useState(() => DEFAULT_VOTING_DATA);
  const [selectedRoundId, setSelectedRoundId] = useState(() => DEFAULT_VOTING_DATA?.round?.id || null);

  // Determine which competition(s) the logged-in player belongs to
  const playerCompetitions = React.useMemo(() => {
    if (!playerUser) return [];
    const matched = [];
    if (playerUser.category_key && categories[playerUser.category_key]) {
      matched.push(playerUser.category_key);
    }
    Object.entries(categories || {}).forEach(([cKey, catObj]) => {
      if (matched.includes(cKey)) return;
      const found = (catObj?.teams || []).some((t) =>
        (t.players || []).some(
          (p) =>
            !p.unknown &&
            (p.id === playerUser.player_id ||
              p.permanentId === playerUser.player_id ||
              (p.name && playerUser.name && p.name.toLowerCase() === playerUser.name.toLowerCase()))
        )
      );
      if (found) matched.push(cKey);
    });
    return matched;
  }, [playerUser, categories]);

  const playerPrimaryCategoryKey = playerCompetitions[0] || playerUser?.category_key || activeCategoryKey;
  const isPlayerInActiveCompetition =
    !playerUser || playerCompetitions.length === 0 || playerCompetitions.includes(activeCategoryKey);

  // When a logged-in player opens the ballot tab, ensure they are on the competition they play in
  useEffect(() => {
    if (
      subTab === 'ballot' &&
      playerUser &&
      playerPrimaryCategoryKey &&
      !playerCompetitions.includes(activeCategoryKey) &&
      onSelectCategory
    ) {
      onSelectCategory(playerPrimaryCategoryKey);
    }
  }, [subTab, playerUser, playerPrimaryCategoryKey, activeCategoryKey]);

  // Admin editable config state
  const votingConfig = votingData?.voting_config || {
    team_size: 6,
    max_picks_per_position: 2,
    include_gk: true,
  };
  const teamSize = Number(votingConfig.team_size || 6);
  const maxPicksPerPos = Number(votingConfig.max_picks_per_position || 2);
  const includeGk = votingConfig.include_gk !== false;

  const [adminTeamSize, setAdminTeamSize] = useState(teamSize);
  const [adminMaxPicks, setAdminMaxPicks] = useState(maxPicksPerPos);
  const [adminIncludeGk, setAdminIncludeGk] = useState(includeGk);

  useEffect(() => {
    setAdminTeamSize(Number(votingConfig.team_size || 6));
    setAdminMaxPicks(Number(votingConfig.max_picks_per_position || 2));
    setAdminIncludeGk(votingConfig.include_gk !== false);
  }, [votingConfig.team_size, votingConfig.max_picks_per_position, votingConfig.include_gk]);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  // Selected votes in current ballot: { GK: ['id'], LB: ['id1', 'id2'], ... }
  const [ballotByPos, setBallotByPos] = useState({
    GK: [''],
    LB: ['', ''],
    CB: ['', ''],
    RB: ['', ''],
    CDM: ['', ''],
    CM: ['', ''],
    LW: ['', ''],
    RW: ['', ''],
    ST: ['', ''],
  });

  // Admin round creation
  const [newRoundTitle, setNewRoundTitle] = useState('');

  // Fetch voting data (publicly accessible for TOTW and TOTT)
  const loadVotingData = async (roundId = null) => {
    setLoading(true);
    setError(null);
    try {
      const voterIdentifier = playerUser?.player_id || '';
      const data = await api.getVotingData(activeCategoryKey, voterIdentifier, roundId || '');
      setVotingData(data);
      if (onVotingDataUpdated) onVotingDataUpdated(data);

      const cfgMaxPicks = Number(data?.voting_config?.max_picks_per_position || 2);
      if (data.round) {
        setSelectedRoundId(data.round.id);
        const nextBallot = {};
        POSITIONS.forEach((pos) => {
          const count = pos.key === 'GK' ? 1 : cfgMaxPicks;
          const existingVotes = data.my_votes?.[pos.key] || [];
          nextBallot[pos.key] = Array.from({ length: count }, (_, idx) => existingVotes[idx]?.player_id || '');
        });
        setBallotByPos(nextBallot);
      }
    } catch (err) {
      console.error('Error loading voting data:', err);
      setError(err.message || 'Failed to load voting data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedRoundId(null);
    loadVotingData(null);
  }, [activeCategoryKey, playerUser?.player_id]);

  const handleVoteSelect = (posKey, slotIdx, playerId) => {
    setBallotByPos((prev) => {
      const count = posKey === 'GK' ? 1 : maxPicksPerPos;
      const currentArr = Array.from({ length: count }, (_, i) => prev[posKey]?.[i] || '');
      currentArr[slotIdx] = playerId;
      return {
        ...prev,
        [posKey]: currentArr,
      };
    });
  };

  const handleSubmitBallot = async (e) => {
    e.preventDefault();
    if (!playerUser) {
      if (onRequestPlayerLogin) onRequestPlayerLogin();
      return;
    }
    if (!votingData?.round?.id) {
      alert('No active voting round.');
      return;
    }
    if (!votingData.round.is_open) {
      alert('Voting window is currently closed by the Admin.');
      return;
    }

    const votesPayload = {};
    POSITIONS.forEach((pos) => {
      if (pos.key === 'GK' && !includeGk) return;
      const maxSlots = pos.key === 'GK' ? 1 : maxPicksPerPos;
      const picks = (ballotByPos[pos.key] || []).slice(0, maxSlots).filter(Boolean);
      votesPayload[pos.key] = picks;
    });

    const totalSelections = Object.values(votesPayload).reduce((acc, arr) => acc + arr.length, 0);

    if (totalSelections === 0) {
      alert('Please select at least one player before submitting your ballot.');
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      await api.submitBallot(activeCategoryKey, {
        voter_id: playerUser.player_id,
        voter_name: `${playerUser.name} (${playerUser.team_name})`,
        round_id: votingData.round.id,
        votes: votesPayload,
      });

      setFeedback({
        type: 'success',
        msg: `🎉 Official Player Ballot submitted by ${playerUser.name} for ${votingData.round.title}! (${totalSelections} votes counted towards ${teamSize}-player Team of the Week)`,
      });
      await loadVotingData(votingData.round.id);
    } catch (err) {
      setFeedback({
        type: 'error',
        msg: err.message || 'Failed to submit ballot.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminToggleWindow = async (isOpen) => {
    if (!votingData?.round?.id) return;
    setLoading(true);
    setFeedback(null);
    try {
      await api.toggleVotingRound(activeCategoryKey, {
        round_id: votingData.round.id,
        is_open: isOpen,
      });
      setFeedback({
        type: 'success',
        msg: isOpen ? '🔓 Voting window opened!' : `🔒 Voting window closed and ${teamSize}-player TOTW locked!`,
      });
      await loadVotingData(votingData.round.id);
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message || 'Toggle failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSaveVotingSettings = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      await api.toggleVotingRound(activeCategoryKey, {
        round_id: votingData?.round?.id,
        team_size: Number(adminTeamSize),
        max_picks_per_position: Number(adminMaxPicks),
        include_gk: Boolean(adminIncludeGk),
      });
      setFeedback({
        type: 'success',
        msg: `⚙️ Voting settings updated: ${adminTeamSize} players in TOTW/Season, up to ${adminMaxPicks} vote(s) per position, Goalkeeper (GK) ${adminIncludeGk ? 'INCLUDED' : 'EXCLUDED'}!`,
      });
      await loadVotingData(votingData?.round?.id);
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to update voting settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminQuickToggleGk = async (nextIncludeGk) => {
    setAdminIncludeGk(nextIncludeGk);
    setLoading(true);
    setFeedback(null);
    try {
      await api.toggleVotingRound(activeCategoryKey, {
        round_id: votingData?.round?.id,
        team_size: Number(adminTeamSize),
        max_picks_per_position: Number(adminMaxPicks),
        include_gk: Boolean(nextIncludeGk),
      });
      setFeedback({
        type: 'success',
        msg: nextIncludeGk
          ? '🧤 Goalkeeper (GK) position ENABLED for voting, TOTW, and TOTT!'
          : '🚫 Goalkeeper (GK) position EXCLUDED from voting, TOTW, and TOTT!',
      });
      await loadVotingData(votingData?.round?.id);
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to toggle Goalkeeper inclusion' });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminCreateRound = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.toggleVotingRound(activeCategoryKey, {
        create_new: true,
        title: newRoundTitle.trim() || undefined,
      });
      setFeedback({
        type: 'success',
        msg: `✨ New voting round "${res.round.title}" started! Window is now open.`,
      });
      setNewRoundTitle('');
      await loadVotingData(res.round.id);
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message || 'Create round failed' });
    } finally {
      setLoading(false);
    }
  };

  const activeCategoryObj = categories?.[activeCategoryKey] || null;
  const activeCategoryLabel = activeCategoryObj?.label || activeCategoryKey || 'Open League';

  const currentRound = votingData?.round;
  const rawTotw = votingData?.totw || [];
  const totw = (includeGk ? rawTotw : rawTotw.filter((p) => p.position !== 'GK')).slice(0, teamSize);
  const tott = votingData?.tott || { total_rounds: 1, lineup: [] };
  const tottLineup = (includeGk ? tott.lineup || [] : (tott.lineup || []).filter((p) => p.position !== 'GK')).slice(
    0,
    teamSize
  );
  const allRounds = votingData?.allRounds || votingData?.all_rounds || [];
  const votedRoundIds = votingData?.voted_round_ids || [];
  const currentRoundId = currentRound?.id || selectedRoundId;

  const hasVotedThisWeek = Boolean(
    playerUser && (
      (currentRoundId && votedRoundIds.includes(currentRoundId)) ||
      Boolean(currentRound?.has_voted) ||
      Boolean(currentRound?.voter_has_voted) ||
      Boolean(votingData?.has_voted) ||
      Boolean(votingData?.voter_has_voted) ||
      (votingData?.my_votes && Object.values(votingData.my_votes).some((arr) => Array.isArray(arr) && arr.length > 0))
    )
  );

  const myVotesList = React.useMemo(() => {
    if (!votingData?.my_votes) return [];
    const list = [];
    Object.entries(votingData.my_votes).forEach(([posKey, picks]) => {
      if (Array.isArray(picks) && picks.length > 0) {
        picks.forEach((p) => {
          list.push({ posKey, ...p });
        });
      }
    });
    return list;
  }, [votingData?.my_votes]);
  const { candidates, allPlayers } = React.useMemo(() => {
    const apiAll = votingData?.all_players || [];
    const apiCandidates = votingData?.candidates || {};
    const catTeams = activeCategoryObj?.teams || [];

    // Check if apiAll matches the current category's teams
    const catTeamIds = new Set(catTeams.map((t) => t.id));
    const apiMatchesCategory =
      apiAll.length > 0 && (catTeamIds.size === 0 || apiAll.some((p) => catTeamIds.has(p.team_id)));

    if (apiMatchesCategory) {
      return { candidates: apiCandidates, allPlayers: apiAll };
    }

    // Build directly from activeCategoryObj.teams so newly generated competitions work immediately
    const fallbackAll = [];
    const fallbackCandidates = {};
    POSITIONS.forEach((pos) => {
      fallbackCandidates[pos.key] = [];
    });

    catTeams.forEach((team) => {
      (team.players || []).forEach((p, idx) => {
        if (p.unknown) return;
        const pos = p.position || '';
        const pEntry = {
          id: p.id,
          player_id: p.permanentId || p.id,
          name: p.name,
          position: pos,
          team_id: team.id,
          team_name: team.name,
          team_color: team.color,
        };
        fallbackAll.push(pEntry);
        if (pos === 'GK' && !includeGk) return;
        if (pos && fallbackCandidates[pos]) {
          fallbackCandidates[pos].push(pEntry);
        }
      });
    });

    return {
      candidates: fallbackAll.length > 0 ? fallbackCandidates : apiCandidates,
      allPlayers: fallbackAll.length > 0 ? fallbackAll : apiAll,
    };
  }, [votingData, activeCategoryObj, includeGk]);

  const ballotPositions = POSITIONS.filter((pos) => includeGk || pos.key !== 'GK');
  const categoryEntries = Object.entries(categories || {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Competition Selector Bar (Vote & View Honours by Specific Competition) */}
      {categoryEntries.length > 0 && (
        <div
          style={{
            background: '#121212',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '12px 16px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>🏆</span>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Select Competition for TOTW, TOTT &amp; Player Voting
              </div>
              <div style={{ fontSize: '11.5px', color: '#8E8E93' }}>
                Players vote under the specific League or Cup competition they are playing in.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {categoryEntries.map(([cKey, cObj]) => {
              const isSelected = cKey === activeCategoryKey;
              const isPlayerComp = playerCompetitions.includes(cKey);
              return (
                <button
                  key={cKey}
                  type="button"
                  onClick={() => onSelectCategory && onSelectCategory(cKey)}
                  style={{
                    background: isSelected ? '#FF9500' : '#121212',
                    color: isSelected ? '#16201B' : '#EBEBF5',
                    border: isPlayerComp ? '2px solid #6CE5A0' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '999px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{cObj.mode === 'cup' ? '🏆' : '⚽'} {cObj.label}</span>
                  {isPlayerComp && (
                    <span
                      style={{
                        background: isSelected ? '#16201B' : 'rgba(255, 255, 255, 0.1)',
                        color: '#6CE5A0',
                        fontSize: '9.5px',
                        padding: '1px 6px',
                        borderRadius: '999px',
                      }}
                    >
                      YOUR COMPETITION
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Header Section */}
      <div
        style={{
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '14px',
          padding: '18px 22px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '24px' }}>⭐</span>
            <h2
              className="scoreboard"
              style={{
                fontSize: '26px',
                letterSpacing: '0.04em',
                margin: 0,
                color: '#FFFFFF',
              }}
            >
              {activeCategoryLabel.toUpperCase()} — TOTW, TOTT &amp; PLAYER VOTING
            </h2>
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 800,
                padding: '3px 9px',
                borderRadius: '999px',
                background: 'rgba(255, 149, 0, 0.16)',
                color: '#FF9500',
                border: '1px solid rgba(255, 149, 0, 0.4)',
              }}
            >
              {teamSize}-PLAYER LINEUP · {includeGk ? 'GK INCLUDED' : 'OUTFIELD ONLY (NO GK)'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}>
            Official voting and honours for <strong>{activeCategoryLabel}</strong> ({teamSize} players, {includeGk ? 'including GK' : 'GK excluded'}). Only logged-in players registered in this competition can vote.
          </div>
        </div>

        {/* Round Switcher and Window Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {allRounds.length > 0 && (
            <select
              value={selectedRoundId || ''}
              onChange={(e) => {
                const rid = Number(e.target.value);
                setSelectedRoundId(rid);
                loadVotingData(rid);
              }}
              style={{
                background: '#1C1C1E',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {allRounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} {r.is_open ? '(Open)' : '(Closed)'} {r.has_voted ? '• Voted ✓' : ''}
                </option>
              ))}
            </select>
          )}

          {currentRound && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  background: currentRound.is_open ? 'rgba(63, 122, 78, 0.25)' : 'rgba(178, 58, 46, 0.2)',
                  color: currentRound.is_open ? '#5CD685' : '#FF7A70',
                  border: currentRound.is_open ? '1px solid #3F7A4E' : '1px solid #B23A2E',
                }}
              >
                <span>{currentRound.is_open ? '● VOTING OPEN' : '🔒 VOTING CLOSED'}</span>
                <span style={{ color: '#8E8E93', fontWeight: 500 }}>
                  • {currentRound.total_votes || 0} votes cast
                </span>
              </div>

              {(isCmsMode || cmsUser) && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleAdminToggleWindow(!currentRound.is_open)}
                  style={{
                    background: currentRound.is_open ? '#B23A2E' : '#3F7A4E',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: '999px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: currentRound.is_open ? '0 2px 8px rgba(178,58,46,0.3)' : '0 2px 8px rgba(63,122,78,0.3)',
                  }}
                  title={currentRound.is_open ? 'Click to turn voting OFF (players cannot vote)' : 'Click to turn voting ON (players can vote)'}
                >
                  <span>{currentRound.is_open ? '🔒 Turn Voting OFF' : '🔓 Turn Voting ON'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Notice: You must be logged in to vote */}
      {!playerUser && !cmsUser && (
        <div
          style={{
            background: 'rgba(255, 149, 0, 0.1)',
            border: '1px solid rgba(255, 149, 0, 0.38)',
            borderRadius: '12px',
            padding: '12px 18px',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>📢</span>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                VOTING NOTICE: YOU SHOULD BE LOGGED IN TO VOTE
              </div>
              <div style={{ fontSize: '12px', color: '#EBEBF5', marginTop: '2px' }}>
                Official voting is open to registered players and tournament staff. Please sign in with your Player Code or Manager account to cast your ballot.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onRequestPlayerLogin}
            style={{
              background: '#FF9500',
              color: '#16201B',
              border: 'none',
              borderRadius: '999px',
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(255, 149, 0, 0.25)',
            }}
          >
            ⚽ Sign In to Vote
          </button>
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          background: '#121212',
          padding: '6px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          className="tab-btn"
          onClick={() => setSubTab('totw')}
          style={{
            flex: 1,
            padding: '9px 14px',
            borderRadius: '6px',
            border: 'none',
            background: subTab === 'totw' ? '#FF9500' : 'transparent',
            color: subTab === 'totw' ? '#16201B' : '#8E8E93',
            fontWeight: 800,
            fontSize: '12px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          🏆 Team of the Week ({teamSize} Players — Public)
        </button>

        <button
          type="button"
          className="tab-btn"
          onClick={() => setSubTab('tott')}
          style={{
            flex: 1,
            padding: '9px 14px',
            borderRadius: '6px',
            border: 'none',
            background: subTab === 'tott' ? '#FF9500' : 'transparent',
            color: subTab === 'tott' ? '#16201B' : '#8E8E93',
            fontWeight: 800,
            fontSize: '12px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          👑 Team of the Season / TOTT ({teamSize} Players — Public)
        </button>

        <button
          type="button"
          className="tab-btn"
          onClick={() => setSubTab('ballot')}
          style={{
            flex: 1,
            padding: '9px 14px',
            borderRadius: '6px',
            border: 'none',
            background: subTab === 'ballot' ? '#FF9500' : 'transparent',
            color: subTab === 'ballot' ? '#16201B' : '#8E8E93',
            fontWeight: 800,
            fontSize: '12px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {hasVotedThisWeek
            ? `✅ Vote Recorded (${currentRound?.title || 'This Week'})`
            : `🗳️ Player Vote Ballot ${playerUser ? `(${playerUser.name})` : '🔒'}`}
        </button>

        {(isCmsMode || cmsUser) && (
          <button
            type="button"
            className="tab-btn"
            onClick={() => setSubTab('admin')}
            style={{
              padding: '9px 14px',
              borderRadius: '6px',
              border: 'none',
              background: subTab === 'admin' ? '#FF9500' : 'transparent',
              color: subTab === 'admin' ? '#16201B' : '#8E8E93',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ⚙️ Admin Voting Settings &amp; Window
          </button>
        )}
      </div>

      {/* Alerts */}
      {feedback && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            background: feedback.type === 'success' ? '#123D2E' : '#3D1A1A',
            color: feedback.type === 'success' ? '#6CE5A0' : '#FF8080',
            border: feedback.type === 'success' ? '1px solid #2F7D5C' : '1px solid #7D2F2F',
          }}
        >
          {feedback.msg}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            background: '#3D1A1A',
            color: '#FF8080',
            border: '1px solid #7D2F2F',
          }}
        >
          {error}
        </div>
      )}

      {/* 1. CAST BALLOT SUB-TAB (Gated to Logged-In Players) */}
      {subTab === 'ballot' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {!playerUser ? (
            <div
              style={{
                background: 'linear-gradient(145deg, #121212 0%, #000000 100%)',
                border: '1px solid #FF9500',
                borderRadius: '14px',
                padding: '32px 24px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '14px',
                boxShadow: '0 14px 30px rgba(0,0,0,0.35)',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(255, 149, 0, 0.16)',
                  border: '1px solid rgba(255, 149, 0, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                }}
              >
                🔒
              </div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                VERIFIED RUIRU TITANS SQUAD BALLOT
              </div>
              <h3 className="scoreboard" style={{ fontSize: '30px', color: '#FFFFFF', margin: 0, letterSpacing: '0.04em' }}>
                ONLY LOGGED-IN PLAYERS CAN VOTE
              </h3>
              <p style={{ fontSize: '13px', color: '#8E8E93', maxWidth: '520px', margin: 0, lineHeight: 1.6 }}>
                Team of the Week (TOTW) and Team of the Tournament (TOTT) honours are publicly accessible to everyone, but casting official weekly ballots is restricted to registered Ruiru Titans players.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={onRequestPlayerLogin}
                  style={{
                    background: '#FF9500',
                    color: '#16201B',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(255, 149, 0, 0.3)',
                  }}
                >
                  🗳️ Sign In as a Player to Vote
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('totw')}
                  style={{
                    background: '#1C1C1E',
                    color: '#EBEBF5',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '12px 20px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🏆 View Public TOTW Lineup
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Authenticated Player Voter Profile Bar */}
              <div
                style={{
                  background: '#121212',
                  border: '1px solid #3F7A4E',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: playerUser.team_color || '#3F7A4E',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#fff',
                    }}
                  >
                    ⚽
                  </span>
                  <div>
                    <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6CE5A0', fontWeight: 800 }}>
                      ✓ Verified Player Ballot Active • Competition: {activeCategoryLabel} • {teamSize}-Player TOTW
                    </div>
                    <div style={{ fontSize: '14px', color: '#FFFFFF', fontWeight: 800 }}>
                      {playerUser.name} <span style={{ color: '#8E8E93', fontWeight: 600 }}>• {playerUser.team_name}</span>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '11.5px', color: '#8E8E93' }}>
                  Permanent Player ID: <code style={{ color: '#FF9500', fontWeight: 700 }}>{playerUser.player_id}</code>
                </div>
              </div>

              {!isPlayerInActiveCompetition && (
                <div
                  style={{
                    background: 'rgba(255, 149, 0, 0.16)',
                    border: '1px solid #FF9500',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    ⚠️ You are registered in <strong>{categories[playerPrimaryCategoryKey]?.label || playerPrimaryCategoryKey}</strong>. Players vote under the specific competition they are playing in.
                  </div>
                  {onSelectCategory && (
                    <button
                      type="button"
                      onClick={() => onSelectCategory(playerPrimaryCategoryKey)}
                      style={{
                        background: '#FF9500',
                        color: '#16201B',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 14px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Switch to {categories[playerPrimaryCategoryKey]?.label || 'My Competition'} →
                    </button>
                  )}
                </div>
              )}

              {!currentRound?.is_open && hasVotedThisWeek && (
                <div
                  style={{
                    background: 'rgba(178, 58, 46, 0.15)',
                    border: '1px solid #B23A2E',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    color: '#FF9990',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>🔒</span>
                  <span>
                    <strong>Voting Window is currently CLOSED for this round.</strong> Switch to an open round above or view the locked {teamSize}-player Team of the Week in the TOTW tab.
                  </span>
                </div>
              )}

              {/* Positional Ballot Cards or Completed Confirmation */}
              {hasVotedThisWeek ? (
                <div
                  style={{
                    background: 'linear-gradient(145deg, #121212 0%, #000000 100%)',
                    border: '1px solid #3F7A4E',
                    borderRadius: '16px',
                    padding: '32px 24px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
                  }}
                >
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: 'rgba(108, 229, 160, 0.15)',
                      border: '2px solid #6CE5A0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '30px',
                    }}
                  >
                    ✅
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#6CE5A0', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
                      BALLOT RECORDED • NO FURTHER VOTES ALLOWED FOR THIS ROUND
                    </div>
                    <h3 className="scoreboard" style={{ fontSize: '32px', color: '#FFFFFF', margin: '0 0 8px', letterSpacing: '0.03em' }}>
                      OFFICIAL VOTE FOR {currentRound?.title?.toUpperCase() || 'THIS WEEK'} COMPLETED
                    </h3>
                    <p style={{ fontSize: '13.5px', color: '#8E8E93', maxWidth: '580px', margin: '0 auto', lineHeight: 1.6 }}>
                      Thank you, <strong>{playerUser.name}</strong> ({playerUser.team_name}). Your official player ballot for <strong>{currentRound?.title || 'this week'}</strong> has been securely logged and counted toward the official <strong>{teamSize}-player Team of the Week (TOTW)</strong>.
                    </p>
                  </div>

                  <div
                    style={{
                      background: 'rgba(255, 149, 0, 0.1)',
                      border: '1px solid rgba(255, 149, 0, 0.35)',
                      borderRadius: '10px',
                      padding: '12px 20px',
                      color: '#FFFFFF',
                      fontSize: '12.5px',
                      maxWidth: '560px',
                      lineHeight: 1.5,
                    }}
                  >
                    🔒 <strong>Single-Vote Rule:</strong> To preserve fair competition and statistical integrity, registered players can only vote once per week. The ballot voting form for this round is removed and will reopen when the tournament manager initiates <strong>next week's voting round</strong>.
                  </div>

                  {myVotesList.length > 0 && (
                    <div style={{ width: '100%', maxWidth: '640px', marginTop: '12px', textAlign: 'left' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                        📋 Your Submitted Ballot Selections:
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                          gap: '10px',
                        }}
                      >
                        {myVotesList.map((vote, vIdx) => {
                          const posObj = POSITIONS.find((p) => p.key === vote.posKey) || { icon: '⚽', name: vote.posKey };
                          return (
                            <div
                              key={vIdx}
                              style={{
                                background: '#1C1C1E',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                              }}
                            >
                              <span style={{ fontSize: '20px' }}>{posObj.icon}</span>
                              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: '#FF9500' }}>
                                  {vote.posKey}
                                </div>
                                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {vote.player_name || vote.name}
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#8E8E93' }}>
                                  {vote.team_name}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setSubTab('totw')}
                      style={{
                        background: '#FF9500',
                        color: '#16201B',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '11px 24px',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(255, 149, 0, 0.3)',
                      }}
                    >
                      🏆 View Official Team of the Week (TOTW) Lineup →
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubTab('tott')}
                      style={{
                        background: '#1C1C1E',
                        color: '#EBEBF5',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '11px 20px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      👑 View Season Team of the Tournament (TOTT)
                    </button>
                  </div>
                </div>
              ) : !currentRound?.is_open ? (
                <div
                  style={{
                    background: 'linear-gradient(145deg, #121212 0%, #081B15 100%)',
                    border: '2px solid #B23A2E',
                    borderRadius: '16px',
                    padding: '36px 24px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
                  }}
                >
                  <div
                    style={{
                      width: '68px',
                      height: '68px',
                      borderRadius: '50%',
                      background: 'rgba(178, 58, 46, 0.15)',
                      border: '2px solid #B23A2E',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '30px',
                    }}
                  >
                    🔒
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF7A70', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
                      VOTING WINDOW CLOSED BY TOURNAMENT ADMINISTRATOR
                    </div>
                    <h3 className="scoreboard" style={{ fontSize: '30px', color: '#FFFFFF', margin: '0 0 8px', letterSpacing: '0.03em' }}>
                      OFFICIAL VOTING IS TURNED OFF FOR {currentRound?.title?.toUpperCase() || 'THIS WEEK'}
                    </h3>
                    <p style={{ fontSize: '13.5px', color: '#8E8E93', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
                      The tournament manager has turned voting <strong>OFF</strong> for {currentRound?.title || 'this round'}.
                      Registered players cannot vote or submit ballots while voting is disabled.
                      You can view the locked <strong>Team of the Week (TOTW)</strong> or the overall <strong>Season Team of the Tournament (TOTT)</strong> below.
                    </p>
                  </div>

                  {(isCmsMode || cmsUser) && (
                    <div
                      style={{
                        background: 'rgba(255, 149, 0, 0.1)',
                        border: '1px solid rgba(255, 149, 0, 0.35)',
                        borderRadius: '10px',
                        padding: '12px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        maxWidth: '560px',
                      }}
                    >
                      <span style={{ fontSize: '12.5px', color: '#FFFFFF' }}>
                        👑 <strong>Admin Quick Action:</strong> Reopen voting to allow players to cast ballots.
                      </span>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleAdminToggleWindow(true)}
                        style={{
                          background: '#3F7A4E',
                          color: '#FFF',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '8px 16px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        🔓 Turn Voting ON Now
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setSubTab('totw')}
                      style={{
                        background: '#FF9500',
                        color: '#16201B',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '11px 24px',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(255, 149, 0, 0.3)',
                      }}
                    >
                      🏆 View Official Team of the Week (TOTW) Lineup →
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubTab('tott')}
                      style={{
                        background: '#1C1C1E',
                        color: '#EBEBF5',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '11px 20px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      👑 View Season Team of the Tournament (TOTT)
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitBallot}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                      gap: '16px',
                      marginBottom: '20px',
                    }}
                  >
                  {ballotPositions.map((pos) => {
                    const posCandidates = candidates[pos.key] || [];

                    if (pos.key === 'GK') {
                      const selectedGkId = ballotByPos.GK?.[0] || '';
                      const selectedGk = allPlayers.find((p) => p.player_id === selectedGkId);

                      return (
                        <div
                          key={pos.key}
                          style={{
                            background: '#121212',
                            border: selectedGkId ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '20px' }}>{pos.icon}</span>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>
                                  {pos.name.toUpperCase()}
                                </div>
                                <div style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 600 }}>
                                  Optional (0 or 1 pick)
                                </div>
                              </div>
                            </div>

                            <span
                              style={{
                                background: selectedGkId ? '#FF9500' : 'transparent',
                                color: selectedGkId ? '#16201B' : '#8E8E93',
                                border: selectedGkId ? 'none' : '1px dashed rgba(255, 255, 255, 0.1)',
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '4px',
                              }}
                            >
                              {selectedGkId ? 'VOTED' : 'OPTIONAL'}
                            </span>
                          </div>

                          {selectedGk ? (
                            <div
                              style={{
                                background: '#1C1C1E',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                                  {selectedGk.name}
                                </div>
                                <div style={{ fontSize: '11px', color: '#8E8E93', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selectedGk.team_color || '#2E5A8F' }} />
                                  {selectedGk.team_name}
                                </div>
                              </div>
                              {currentRound?.is_open && (
                                <button
                                  type="button"
                                  onClick={() => handleVoteSelect('GK', 0, '')}
                                  style={{ background: 'transparent', border: 'none', color: '#FF7A70', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          ) : (
                            <div style={{ border: '1px dashed rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '8px', textAlign: 'center', fontSize: '11.5px', color: '#8E8E93' }}>
                              No Goalkeeper selected (optional)
                            </div>
                          )}

                          {currentRound?.is_open && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <label style={{ fontSize: '11px', color: '#8E8E93' }}>Select Goalkeeper ({posCandidates.length} eligible):</label>
                              <select
                                value={selectedGkId || ''}
                                onChange={(e) => handleVoteSelect('GK', 0, e.target.value)}
                                style={{
                                  background: '#1C1C1E',
                                  color: '#FFFFFF',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                }}
                              >
                                <option value="">-- No GK vote (Skip) --</option>
                                {posCandidates.map((p) => (
                                  <option key={p.player_id} value={p.player_id}>
                                    {p.name} — {p.team_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const currentPosPicks = Array.from({ length: maxPicksPerPos }, (_, i) => ballotByPos[pos.key]?.[i] || '');
                    const votedCount = currentPosPicks.filter(Boolean).length;

                    return (
                      <div
                        key={pos.key}
                        style={{
                          background: '#121212',
                          border: votedCount > 0 ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '12px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '20px' }}>{pos.icon}</span>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>
                                {pos.name.toUpperCase()}
                              </div>
                              <div style={{ fontSize: '11px', color: '#FF9500', fontWeight: 600 }}>
                                Pick up to {maxPicksPerPos} {pos.name}
                                {maxPicksPerPos > 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>

                          <span
                            style={{
                              background:
                                votedCount === maxPicksPerPos
                                  ? '#FF9500'
                                  : votedCount > 0
                                  ? 'rgba(255, 149, 0, 0.2)'
                                  : 'transparent',
                              color:
                                votedCount === maxPicksPerPos
                                  ? '#16201B'
                                  : votedCount > 0
                                  ? '#FF9500'
                                  : '#8E8E93',
                              border: votedCount === 0 ? '1px dashed rgba(255, 255, 255, 0.1)' : 'none',
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            {votedCount}/{maxPicksPerPos} VOTED
                          </span>
                        </div>

                        {currentPosPicks.map((pickId, slotIdx) => {
                          const pickedPlayer = allPlayers.find((p) => p.player_id === pickId);
                          const otherPickedIds = currentPosPicks.filter((_, idx) => idx !== slotIdx && Boolean(_));
                          return (
                            <div
                              key={`${pos.key}_slot_${slotIdx}`}
                              style={{ background: '#121212', padding: '10px', borderRadius: '8px', border: '1px solid #1C1C1E' }}
                            >
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#8E8E93', marginBottom: '4px' }}>
                                Choice #{slotIdx + 1} {slotIdx > 0 ? '(Optional)' : ''}:
                              </div>
                              {pickedPlayer ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF' }}>
                                    {pickedPlayer.name} ({pickedPlayer.team_name})
                                  </span>
                                  {currentRound?.is_open && (
                                    <button
                                      type="button"
                                      onClick={() => handleVoteSelect(pos.key, slotIdx, '')}
                                      style={{ background: 'transparent', border: 'none', color: '#FF7A70', fontSize: '11px', cursor: 'pointer' }}
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              ) : null}

                              {currentRound?.is_open && (
                                <select
                                  value={pickId || ''}
                                  onChange={(e) => handleVoteSelect(pos.key, slotIdx, e.target.value)}
                                  style={{
                                    width: '100%',
                                    background: '#1C1C1E',
                                    color: '#FFFFFF',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <option value="">-- Choose Choice #{slotIdx + 1} for {pos.key} --</option>
                                  {posCandidates
                                    .filter((p) => !otherPickedIds.includes(p.player_id))
                                    .map((p) => (
                                      <option key={p.player_id} value={p.player_id}>
                                        {p.name} — {p.team_name}
                                      </option>
                                    ))}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {currentRound?.is_open && (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        background: '#FF9500',
                        color: '#16201B',
                        border: 'none',
                        padding: '12px 36px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(255, 149, 0, 0.3)',
                      }}
                    >
                      {loading ? 'Submitting Ballot…' : `🗳️ SUBMIT OFFICIAL BALLOT AS ${playerUser.name.toUpperCase()}`}
                    </button>
                  </div>
                )}
              </form>
            )}
          </>
        )}
      </div>
      )}

      {/* 2. TEAM OF THE WEEK (TOTW) - PUBLICLY ACCESSIBLE */}
      {subTab === 'totw' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              textAlign: 'center',
              background: '#121212',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#FF9500', fontWeight: 800 }}>
              PUBLIC OFFICIAL {teamSize}-PLAYER LINEUP • {includeGk ? 'GOALKEEPER INCLUDED' : 'OUTFIELD ONLY (GK EXCLUDED)'}
            </div>
            <div className="scoreboard" style={{ fontSize: '28px', color: '#FFFFFF', margin: '2px 0' }}>
              ⭐ {currentRound?.title?.toUpperCase() || 'WEEK 1'} TEAM OF THE WEEK (TOTW) ⭐
            </div>
            <div style={{ fontSize: '12px', color: '#8E8E93' }}>
              Features the top {teamSize} players selected by official player ballots in this round.
            </div>
            {!playerUser && (
              <button
                type="button"
                onClick={onRequestPlayerLogin}
                style={{
                  marginTop: '6px',
                  background: 'rgba(255, 149, 0, 0.16)',
                  color: '#FF9500',
                  border: '1px solid #FF9500',
                  borderRadius: '999px',
                  padding: '5px 14px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                🗳️ Are you a Ruiru Titans player? Sign In to Vote
              </button>
            )}
          </div>

          {/* Virtual Pitch Formation */}
          <div
            style={{
              background: 'linear-gradient(180deg, #0D3328 0%, #082119 100%)',
              border: '2px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '28px 18px',
              position: 'relative',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '140px',
                height: '140px',
                border: '1px dashed rgba(255,255,255,0.08)',
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />

            {/* Attacking Row (LW, ST, RW) */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {totw.filter((p) => ['LW', 'ST', 'RW', 'WING'].includes(p.position)).map((p, idx) => (
                <PlayerCard
                  key={p.player_id || `att_${idx}`}
                  player={p}
                  posIcon={p.position === 'ST' ? '🎯' : '⚡'}
                />
              ))}
            </div>

            {/* Midfielders Row (CDM, CM) */}
            <div style={{ display: 'flex', justifyContent: 'space-around', gap: '16px', flexWrap: 'wrap' }}>
              {totw.filter((p) => ['CDM', 'CM', 'MID'].includes(p.position)).map((p, idx) => (
                <PlayerCard key={p.player_id || `mid_${idx}`} player={p} posIcon="⚙️" />
              ))}
            </div>

            {/* Defenders Row (LB, CB, RB) */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {totw.filter((p) => ['LB', 'CB', 'RB', 'DEF'].includes(p.position)).map((p, idx) => (
                <PlayerCard key={p.player_id || `def_${idx}`} player={p} posIcon="🛡️" />
              ))}
            </div>

            {/* Goalkeeper Row (only if GK inclusion is enabled and present) */}
            {includeGk && totw.some((p) => p.position === 'GK') && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {totw.filter((p) => p.position === 'GK').map((p, idx) => (
                  <PlayerCard key={p.player_id || `gk_${idx}`} player={p} posIcon="🧤" />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. TEAM OF THE TOURNAMENT / SEASON (TOTT) - PUBLICLY ACCESSIBLE */}
      {subTab === 'tott' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              textAlign: 'center',
              background: '#121212',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#FF9500', fontWeight: 800 }}>
              PUBLIC CUMULATIVE SEASON HONOURS • {includeGk ? 'GK INCLUDED' : 'OUTFIELD ONLY (GK EXCLUDED)'}
            </div>
            <div className="scoreboard" style={{ fontSize: '28px', color: '#FFFFFF', margin: '4px 0' }}>
              👑 {teamSize}-PLAYER TEAM OF THE TOURNAMENT / SEASON (TOTT) 👑
            </div>
            <div style={{ fontSize: '12px', color: '#8E8E93' }}>
              Features the top {teamSize} players with the <strong>highest average votes per round</strong> across all {tott.total_rounds} tournament rounds.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {tottLineup.map((tottPlayer, idx) => {
              const iconMap = {
                GK: '🧤',
                LB: '🛡️',
                CB: '🛡️',
                RB: '🛡️',
                DEF: '🛡️',
                CDM: '⚙️',
                CM: '⚙️',
                MID: '⚙️',
                LW: '⚡',
                RW: '⚡',
                WING: '⚡',
                ST: '🎯',
              };
              const icon = iconMap[tottPlayer.position] || '⭐';

              return (
                <div
                  key={tottPlayer.player_id || idx}
                  style={{
                    background: '#121212',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '22px' }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>
                          {(tottPlayer.slot_label || tottPlayer.position_name).toUpperCase()}
                        </div>
                        <div style={{ fontSize: '11px', color: '#FF9500', fontWeight: 600 }}>
                          Season Average Honours
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        background: '#FF9500',
                        color: '#16201B',
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      #1 HONOUR
                    </span>
                  </div>

                  {tottPlayer.player_id ? (
                    <div
                      style={{
                        background: '#1C1C1E',
                        border: '1px solid #FF9500',
                        borderRadius: '10px',
                        padding: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF' }}>
                          {tottPlayer.player_name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#8E8E93', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tottPlayer.team_color || '#2E5A8F' }} />
                          {tottPlayer.team_name}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#FF9500' }}>
                          ⭐ {tottPlayer.average_votes}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#8E8E93' }}>
                          avg / round ({tottPlayer.total_votes} total)
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ border: '1px dashed rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '14px', textAlign: 'center', color: '#8E8E93', fontSize: '12px' }}>
                      Pending votes in this position
                    </div>
                  )}

                  {tottPlayer.rankings && tottPlayer.rankings.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#8E8E93', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>
                        Top Contenders:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {tottPlayer.rankings.map((r, rIdx) => (
                          <div
                            key={r.player_id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '11.5px',
                              padding: '4px 6px',
                              borderRadius: '4px',
                              background: rIdx === 0 ? 'rgba(255, 149, 0, 0.1)' : 'transparent',
                            }}
                          >
                            <span style={{ color: rIdx === 0 ? '#FF9500' : '#EBEBF5' }}>
                              #{rIdx + 1} {r.player_name} ({r.team_name})
                            </span>
                            <span style={{ fontWeight: 700, color: '#8E8E93' }}>
                              {r.average_votes} avg ({r.total_votes} v)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. ADMIN CONTROL SUB-TAB */}
      {subTab === 'admin' && (isCmsMode || cmsUser) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Admin Voting Configuration Card */}
          <div
            style={{
              background: '#121212',
              border: '1px solid #FF9500',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#FF9500', fontWeight: 800 }}>
                ADMIN VOTING CONFIGURATION (TOTW &amp; TOTT / SEASON)
              </div>
              <h3 style={{ fontSize: '18px', color: '#FFFFFF', margin: '4px 0 6px 0' }}>
                Adjust Number of Players Voted For &amp; Goalkeeper (GK) Inclusion
              </h3>
              <p style={{ fontSize: '12px', color: '#8E8E93', margin: 0 }}>
                Changes here immediately update the Player Ballot, Team of the Week (TOTW), and Team of the Tournament/Season (TOTT). If Goalkeeper (GK) is toggled OFF, GK will not appear on the ballot or in TOTW/TOTT.
              </p>
            </div>

            <form
              onSubmit={handleAdminSaveVotingSettings}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '14px',
                alignItems: 'end',
              }}
            >
              {/* Number of Players in TOTW / TOTT */}
              <div
                style={{
                  background: '#1C1C1E',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF' }}>
                  🏆 Number of Players in TOTW &amp; Season (TOTT)
                </label>
                <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                  Total lineup size displayed in Team of the Week &amp; Season (e.g. 5, 6, 7, 11)
                </div>
                <input
                  type="number"
                  min={1}
                  max={22}
                  value={adminTeamSize}
                  onChange={(e) => setAdminTeamSize(e.target.value)}
                  style={{
                    marginTop: '4px',
                    background: '#121212',
                    border: '1px solid #FF9500',
                    color: '#FFFFFF',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 800,
                  }}
                />
              </div>

              {/* Max Votes per Position on Ballot */}
              <div
                style={{
                  background: '#1C1C1E',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF' }}>
                  🗳️ Max Players Voted Per Position
                </label>
                <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                  Number of players a voter can pick in each outfield position
                </div>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={adminMaxPicks}
                  onChange={(e) => setAdminMaxPicks(e.target.value)}
                  style={{
                    marginTop: '4px',
                    background: '#121212',
                    border: '1px solid #FF9500',
                    color: '#FFFFFF',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 800,
                  }}
                />
              </div>

              {/* Goalkeeper Inclusion Toggle */}
              <div
                style={{
                  background: '#1C1C1E',
                  border: adminIncludeGk ? '1px solid #3F7A4E' : '1px solid #B23A2E',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF' }}>
                    🧤 Include Goalkeeper (GK) Position
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: adminIncludeGk ? 'rgba(63,122,78,0.3)' : 'rgba(178,58,46,0.3)',
                      color: adminIncludeGk ? '#6CE5A0' : '#FF8080',
                    }}
                  >
                    {adminIncludeGk ? 'ON (INCLUDED)' : 'OFF (EXCLUDED)'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                  {adminIncludeGk
                    ? 'GK is included in ballot voting, TOTW, and TOTT.'
                    : 'GK is hidden from ballot voting and excluded from TOTW & TOTT.'}
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleAdminQuickToggleGk(!adminIncludeGk)}
                  style={{
                    background: adminIncludeGk ? '#B23A2E' : '#3F7A4E',
                    color: '#FFF',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {adminIncludeGk ? '🚫 Turn OFF Goalkeeper Voting' : '🧤 Turn ON Goalkeeper Voting'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    background: '#FF9500',
                    color: '#16201B',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(255, 149, 0,0.25)',
                  }}
                >
                  💾 Save Voting Settings
                </button>
              </div>
            </form>
          </div>

          {/* Round Window Controls Card */}
          <div
            style={{
              background: '#121212',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#FF9500', fontWeight: 800 }}>
                CMS VOTING WINDOW CONTROLS
              </div>
              <h3 style={{ fontSize: '18px', color: '#FFFFFF', margin: '4px 0 6px 0' }}>
                Manage Round Windows &amp; {teamSize}-Player Cutoffs
              </h3>
              <p style={{ fontSize: '12px', color: '#8E8E93', margin: 0 }}>
                Opening the window enables logged-in players to cast votes. Closing the window locks the {teamSize}-player Team of the Week and updates tournament averages.
              </p>
            </div>

            {currentRound && (
              <div
                style={{
                  background: '#1C1C1E',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
                    Current Selected Round: {currentRound.title}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '2px' }}>
                    Status:{' '}
                    <strong style={{ color: currentRound.is_open ? '#5CD685' : '#FF7A70' }}>
                      {currentRound.is_open ? 'OPEN FOR VOTING' : 'CLOSED / LOCKED'}
                    </strong>
                    {' '}• {currentRound.total_votes || 0} votes recorded
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {currentRound.is_open ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleAdminToggleWindow(false)}
                      style={{
                        background: '#B23A2E',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      🔒 Close Voting Window
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleAdminToggleWindow(true)}
                      style={{
                        background: '#3F7A4E',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      🔓 Re-Open Voting Window
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ background: '#1C1C1E', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                Initiate New Week Round (e.g. Week 3, Quarter-Finals)
              </div>
              <form onSubmit={handleAdminCreateRound} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Round Title (e.g. Week 3)…"
                  value={newRoundTitle}
                  onChange={(e) => setNewRoundTitle(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    background: '#121212',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#FFFFFF',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: '#FF9500',
                    color: '#16201B',
                    border: 'none',
                    padding: '8px 20px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ➕ Start New Week Round &amp; Open Window
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerCard({ player, posIcon }) {
  const hasPlayer = Boolean(player && player.player_id);

  return (
    <div
      style={{
        background: '#121212',
        border: hasPlayer ? '2px solid #FF9500' : '1px dashed rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '12px 16px',
        minWidth: '170px',
        maxWidth: '210px',
        textAlign: 'center',
        boxShadow: hasPlayer ? '0 4px 14px rgba(0,0,0,0.4)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ fontSize: '14px' }}>{posIcon}</span>
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.06em' }}>
          {player.slot_label || player.position}
        </span>
      </div>

      <div
        className="scoreboard"
        style={{
          fontSize: '16px',
          color: hasPlayer ? '#FFFFFF' : '#8E8E93',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {player.player_name}
      </div>

      {hasPlayer ? (
        <div style={{ marginTop: '4px' }}>
          <div
            style={{
              fontSize: '11px',
              color: '#8E8E93',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: player.team_color || '#2E5A8F',
              }}
            />
            {player.team_name}
          </div>

          <div
            style={{
              marginTop: '6px',
              background: '#1C1C1E',
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '10.5px',
              fontWeight: 700,
              color: '#FF9500',
              display: 'inline-block',
            }}
          >
            ⭐ {player.votes} Votes
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '4px' }}>
          Pending votes
        </div>
      )}
    </div>
  );
}
