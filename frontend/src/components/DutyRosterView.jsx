import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';

export default function DutyRosterView({
  cat,
  categories = {},
  activeCategoryKey,
  cmsUser = null,
  isCmsMode = false,
  onNavigate = null,
}) {
  const isAdmin = Boolean(cmsUser && isCmsMode);
  const targetCategoryKey = cat?.key || activeCategoryKey || 'ruiru-titans-league-oct-nov-2026';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dutyRoster, setDutyRoster] = useState(() => cat?.dutyRoster || null);
  const [eligiblePlayersMap, setEligiblePlayersMap] = useState({});
  const [activeFilterTab, setActiveFilterTab] = useState('all'); // 'all' | 'pending' | 'completed'
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [notification, setNotification] = useState(null);

  // Exemptions state
  const [showExemptionsSection, setShowExemptionsSection] = useState(false);
  const [exemptTeamId, setExemptTeamId] = useState('');
  const [exemptPlayerId, setExemptPlayerId] = useState('');
  const [exemptReason, setExemptReason] = useState('Medical / Injured');
  const [customReason, setCustomReason] = useState('');
  const [exemptSubmitting, setExemptSubmitting] = useState(false);

  // Teams lookup
  const teamsMap = useMemo(() => {
    const map = {};
    if (cat?.teams) {
      cat.teams.forEach((t) => {
        map[t.id] = t;
      });
    }
    return map;
  }, [cat?.teams]);

  // Load duty roster from backend
  const loadDutyRoster = async (forceRegen = false) => {
    try {
      setLoading(true);
      setError(null);
      if (forceRegen) {
        const res = await api.updateDutyRoster(targetCategoryKey, { action: 'regenerate' });
        if (res?.dutyRoster) {
          setDutyRoster(res.dutyRoster);
          if (res.eligiblePlayers) setEligiblePlayersMap(res.eligiblePlayers);
          setNotification({ type: 'success', text: '⚡ Duty roster generated and updated successfully!' });
        }
      } else {
        const res = await api.getDutyRoster(targetCategoryKey);
        if (res?.dutyRoster) {
          setDutyRoster(res.dutyRoster);
          if (res.eligiblePlayers) setEligiblePlayersMap(res.eligiblePlayers);
        }
      }
    } catch (err) {
      console.error('Failed to load duty roster:', err);
      setError(err.message || 'Failed to load duty roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDutyRoster();
  }, [targetCategoryKey]);

  // Clear transient notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Set of completed player IDs across the entire duty roster
  const completedPlayerIds = useMemo(() => {
    const set = new Set(dutyRoster?.completedPlayerIds || []);
    const assignments = dutyRoster?.assignments || {};
    Object.values(assignments).forEach((a) => {
      if (a?.homeDuty?.completed && a.homeDuty.playerId) {
        set.add(String(a.homeDuty.playerId));
      }
      if (a?.awayDuty?.completed && a.awayDuty.playerId) {
        set.add(String(a.awayDuty.playerId));
      }
    });
    return set;
  }, [dutyRoster]);

  // Set of exempted player IDs
  const exemptionsList = useMemo(() => dutyRoster?.exemptions || [], [dutyRoster?.exemptions]);
  const exemptedPlayerIds = useMemo(() => {
    return new Set(exemptionsList.map((e) => String(e.playerId)));
  }, [exemptionsList]);

  // Get selectable players for a team — strictly EXCLUDING players who have completed duty OR are exempted!
  // "if a player has been ticked remove from list"
  // "the system should not select a player for duty if they appear in the exemption list"
  const getSelectablePlayersForTeam = (teamId) => {
    const backendData = eligiblePlayersMap[teamId];
    if (backendData?.available && backendData.available.length > 0) {
      // Filter out any newly completed or exempted IDs in optimistic state
      const filtered = backendData.available.filter(
        (p) =>
          !completedPlayerIds.has(String(p.id || p.permanentId)) &&
          !exemptedPlayerIds.has(String(p.id || p.permanentId))
      );
      if (filtered.length > 0) return filtered;
    }

    const tObj = teamsMap[teamId];
    if (!tObj?.players) return [];

    // All team players excluding 'Unrecorded scorer', completed players, and exempted players
    const validPlayers = tObj.players.filter(
      (p) => !p.unknown && p.name !== 'Unrecorded scorer'
    );

    const availableOnly = validPlayers.filter(
      (p) =>
        !completedPlayerIds.has(String(p.id || p.permanentId)) &&
        !exemptedPlayerIds.has(String(p.id || p.permanentId))
    );

    // If every single non-exempt player on the team has finished, allow rotation among non-exempt
    const nonExemptPool = validPlayers.filter((p) => !exemptedPlayerIds.has(String(p.id || p.permanentId)));
    return availableOnly.length > 0 ? availableOnly : nonExemptPool;
  };

  // Add a player to the exemption list
  const handleAddExemption = async (e) => {
    if (e) e.preventDefault();
    if (!exemptPlayerId) {
      setNotification({ type: 'error', text: 'Please select a player to exempt.' });
      return;
    }
    const finalReason = customReason.trim() || exemptReason;
    setExemptSubmitting(true);
    try {
      const res = await api.updateDutyRoster(targetCategoryKey, {
        action: 'add_exemption',
        playerId: exemptPlayerId,
        reason: finalReason,
      });
      if (res?.dutyRoster) {
        setDutyRoster(res.dutyRoster);
        if (res.eligiblePlayers) setEligiblePlayersMap(res.eligiblePlayers);
      }
      setNotification({
        type: 'success',
        text: '🛡️ Player exempted from duties and removed from upcoming uncompleted tasks.',
      });
      setExemptPlayerId('');
      setCustomReason('');
    } catch (err) {
      console.error('Failed to add exemption:', err);
      setNotification({ type: 'error', text: err.message || 'Failed to add exemption.' });
    } finally {
      setExemptSubmitting(false);
    }
  };

  // Remove a player from the exemption list
  const handleRemoveExemption = async (playerId) => {
    if (!isAdmin) return;
    setExemptSubmitting(true);
    try {
      const res = await api.updateDutyRoster(targetCategoryKey, {
        action: 'remove_exemption',
        playerId,
      });
      if (res?.dutyRoster) {
        setDutyRoster(res.dutyRoster);
        if (res.eligiblePlayers) setEligiblePlayersMap(res.eligiblePlayers);
      }
      setNotification({
        type: 'success',
        text: '✓ Exemption removed. Player restored to active duty selection pool.',
      });
    } catch (err) {
      console.error('Failed to remove exemption:', err);
      setNotification({ type: 'error', text: err.message || 'Failed to remove exemption.' });
    } finally {
      setExemptSubmitting(false);
    }
  };

  // Toggle duty completion (ticking work done)
  const handleToggleCompletion = async (fixtureId, side, currentCompleted) => {
    if (!isAdmin) return;
    const nextVal = !currentCompleted;
    const saveId = `${fixtureId}-${side}`;
    setSavingKey(saveId);

    // Optimistic state update
    setDutyRoster((prev) => {
      if (!prev) return prev;
      const assignments = { ...(prev.assignments || {}) };
      const entry = { ...(assignments[fixtureId] || {}) };
      const dutyKey = side === 'home' ? 'homeDuty' : 'awayDuty';
      const curDuty = { ...(entry[dutyKey] || {}) };

      curDuty.completed = nextVal;
      curDuty.completedAt = nextVal ? new Date().toISOString() : null;
      entry[dutyKey] = curDuty;
      assignments[fixtureId] = entry;

      // Update days
      const days = (prev.days || []).map((d) => ({
        ...d,
        matches: (d.matches || []).map((m) => {
          if (m.fixtureId !== fixtureId) return m;
          return {
            ...m,
            [side === 'home' ? 'homeTeam' : 'awayTeam']: {
              ...m[side === 'home' ? 'homeTeam' : 'awayTeam'],
              duty: curDuty,
            },
          };
        }),
      }));

      const newCompCount = Object.values(assignments).reduce((acc, a) => {
        return acc + (a?.homeDuty?.completed ? 1 : 0) + (a?.awayDuty?.completed ? 1 : 0);
      }, 0);
      const totalDuties = Object.keys(assignments).length * 2;

      return {
        ...prev,
        assignments,
        days,
        summary: {
          totalDuties,
          completedDuties: newCompCount,
          pendingDuties: Math.max(0, totalDuties - newCompCount),
        },
      };
    });

    try {
      const res = await api.updateDutyRoster(targetCategoryKey, {
        action: 'toggle_completion',
        fixtureId,
        side,
        completed: nextVal,
      });
      if (res?.dutyRoster) {
        setDutyRoster(res.dutyRoster);
        if (res.eligiblePlayers) setEligiblePlayersMap(res.eligiblePlayers);
      }
      setNotification({
        type: 'success',
        text: nextVal
          ? '✅ Work ticked as done! Player has been removed from future selectable lists.'
          : '↩️ Work marked as pending.',
      });
    } catch (err) {
      console.error('Failed to toggle duty completion:', err);
      setNotification({ type: 'error', text: err.message || 'Failed to update duty status.' });
      loadDutyRoster();
    } finally {
      setSavingKey(null);
    }
  };

  // Reassign player for a fixture
  const handleAssignPlayer = async (fixtureId, side, playerId, playerName) => {
    if (!isAdmin) return;
    const saveId = `${fixtureId}-${side}`;
    setSavingKey(saveId);

    try {
      const res = await api.updateDutyRoster(targetCategoryKey, {
        action: 'update_assignment',
        fixtureId,
        side,
        playerId,
        playerName,
      });
      if (res?.dutyRoster) {
        setDutyRoster(res.dutyRoster);
        if (res.eligiblePlayers) setEligiblePlayersMap(res.eligiblePlayers);
      }
      setNotification({ type: 'success', text: `👤 Reassigned duty to ${playerName}.` });
    } catch (err) {
      console.error('Failed to update player assignment:', err);
      setNotification({ type: 'error', text: err.message || 'Failed to assign player.' });
    } finally {
      setSavingKey(null);
    }
  };

  // Filtered matchdays based on active tabs, search query, and team filter
  const filteredDays = useMemo(() => {
    if (!dutyRoster?.days) return [];

    return dutyRoster.days
      .map((day) => {
        const matches = (day.matches || []).filter((m) => {
          // Team filter
          if (selectedTeamFilter !== 'all') {
            const hId = m.homeTeam?.id;
            const aId = m.awayTeam?.id;
            if (hId !== selectedTeamFilter && aId !== selectedTeamFilter) return false;
          }

          // Search query
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const hName = m.homeTeam?.name?.toLowerCase() || '';
            const aName = m.awayTeam?.name?.toLowerCase() || '';
            const hp = m.homeTeam?.duty?.playerName?.toLowerCase() || '';
            const ap = m.awayTeam?.duty?.playerName?.toLowerCase() || '';
            const taskH = m.homeTeam?.duty?.task?.toLowerCase() || '';
            const taskA = m.awayTeam?.duty?.task?.toLowerCase() || '';
            const dStr = m.date?.toLowerCase() || '';
            const matchesSearch =
              hName.includes(q) ||
              aName.includes(q) ||
              hp.includes(q) ||
              ap.includes(q) ||
              taskH.includes(q) ||
              taskA.includes(q) ||
              dStr.includes(q);
            if (!matchesSearch) return false;
          }

          // Tab Filter: All, Pending, Completed
          const homeCompleted = Boolean(m.homeTeam?.duty?.completed);
          const awayCompleted = Boolean(m.awayTeam?.duty?.completed);

          if (activeFilterTab === 'pending') {
            // Show match if at least one duty is pending
            return !homeCompleted || !awayCompleted;
          }
          if (activeFilterTab === 'completed') {
            // Show match if at least one duty is completed
            return homeCompleted || awayCompleted;
          }
          return true;
        });

        return { ...day, matches };
      })
      .filter((day) => day.matches.length > 0);
  }, [dutyRoster?.days, activeFilterTab, selectedTeamFilter, searchQuery]);

  const summary = dutyRoster?.summary || { totalDuties: 0, completedDuties: 0, pendingDuties: 0 };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1180px',
        margin: '0 auto',
        padding: '24px 16px 80px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
        color: '#F2F2F7',
      }}
    >
      {/* Notifications */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '12px',
            background: notification.type === 'error' ? '#FF453A' : '#30D158',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <span>{notification.text}</span>
        </div>
      )}

      {/* Hero Header */}
      <div
        className="duty-hero-card"
        style={{
          background: 'linear-gradient(135deg, rgba(28,28,30,0.95), rgba(44,44,46,0.95))',
          borderRadius: '20px',
          padding: '28px 24px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
          marginBottom: '24px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '28px' }}>🧹</span>
              <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0, color: '#FFFFFF', letterSpacing: '-0.5px' }}>
                Matchday Duty Roster
              </h1>
              {isAdmin && (
                <span
                  style={{
                    background: '#FF9500',
                    color: '#1C1C1E',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Admin Mode Active
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '14px', color: '#AEAEB2', maxWidth: '680px', lineHeight: 1.5 }}>
              Official rotating club duty schedule. Ticking a player as completed removes them from future selection lists so duties are shared equally across the entire squad.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="duty-stat-grid" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div
              style={{
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '12px',
                padding: '10px 16px',
                border: '1px solid rgba(255,255,255,0.08)',
                textAlign: 'center',
                minWidth: '85px',
                flex: '1 1 auto',
              }}
            >
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF' }}>{summary.totalDuties}</div>
              <div style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 600, textTransform: 'uppercase' }}>Total Tasks</div>
            </div>
            <div
              style={{
                background: 'rgba(48, 209, 88, 0.1)',
                borderRadius: '12px',
                padding: '10px 16px',
                border: '1px solid rgba(48, 209, 88, 0.3)',
                textAlign: 'center',
                minWidth: '85px',
                flex: '1 1 auto',
              }}
            >
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#30D158' }}>{summary.completedDuties}</div>
              <div style={{ fontSize: '11px', color: '#30D158', fontWeight: 700, textTransform: 'uppercase' }}>✅ Completed</div>
            </div>
            <div
              style={{
                background: 'rgba(255, 149, 0, 0.1)',
                borderRadius: '12px',
                padding: '10px 16px',
                border: '1px solid rgba(255, 149, 0, 0.3)',
                textAlign: 'center',
                minWidth: '85px',
                flex: '1 1 auto',
              }}
            >
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#FF9500' }}>{summary.pendingDuties}</div>
              <div style={{ fontSize: '11px', color: '#FF9500', fontWeight: 700, textTransform: 'uppercase' }}>⏳ Pending</div>
            </div>
            <div
              style={{
                background: 'rgba(191, 90, 242, 0.1)',
                borderRadius: '12px',
                padding: '10px 16px',
                border: '1px solid rgba(191, 90, 242, 0.3)',
                textAlign: 'center',
                minWidth: '85px',
                cursor: 'pointer',
                flex: '1 1 auto',
              }}
              onClick={() => setShowExemptionsSection((v) => !v)}
              title="Click to view/manage duty exemptions"
            >
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#BF5AF2' }}>{exemptionsList.length}</div>
              <div style={{ fontSize: '11px', color: '#BF5AF2', fontWeight: 700, textTransform: 'uppercase' }}>🛡️ Exempted</div>
            </div>
          </div>
        </div>

        {/* Rules Explainer Banner */}
        <div
          style={{
            marginTop: '20px',
            padding: '14px 18px',
            borderRadius: '12px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>👕</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#6CE5A0' }}>Match 1 of the Day (17:10)</div>
              <div style={{ fontSize: '12.5px', color: '#D1D1D6' }}>
                Wash Team Bibs — 2 players picked from opposing teams
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>🥅</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#FF9500' }}>Match 2 of the Day (18:10)</div>
              <div style={{ fontSize: '12.5px', color: '#D1D1D6' }}>
                Goalposts (To &amp; From Store) — 2 opposing players take side goalpost from store and return back after match
              </div>
            </div>
          </div>
        </div>

        {/* Admin Action Toolbar */}
        {isAdmin && (
          <div
            style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '12px', color: '#AEAEB2', fontWeight: 600 }}>Manager Actions:</span>
            <button
              type="button"
              onClick={() => setShowExemptionsSection((v) => !v)}
              style={{
                background: showExemptionsSection ? '#BF5AF2' : 'rgba(191, 90, 242, 0.15)',
                border: '1px solid #BF5AF2',
                color: showExemptionsSection ? '#1C1C1E' : '#BF5AF2',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              🛡️ {showExemptionsSection ? 'Close Exemptions Manager' : `Manage Duty Exemptions (${exemptionsList.length})`}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Regenerate and distribute unticked duty roster fairly across all non-exempt players?')) {
                  loadDutyRoster(true);
                }
              }}
              disabled={loading}
              style={{
                background: 'rgba(255, 149, 0, 0.15)',
                border: '1px solid #FF9500',
                color: '#FF9500',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              ⚡ Auto-Assign Unticked Players
            </button>
            <button
              type="button"
              onClick={() => loadDutyRoster(false)}
              disabled={loading}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#EBEBF5',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔄 Refresh Roster
            </button>
          </div>
        )}
      </div>

      {/* =========================================================
          DUTY EXEMPTIONS SECTION
         ========================================================= */}
      {(showExemptionsSection || (!isAdmin && exemptionsList.length > 0)) && (
        <div
          style={{
            background: '#1C1C1E',
            borderRadius: '16px',
            border: '1px solid rgba(191, 90, 242, 0.3)',
            padding: '20px 24px',
            marginBottom: '24px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🛡️</span>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
                Duty Exemptions ({exemptionsList.length})
              </h2>
            </div>
            <span style={{ fontSize: '12px', color: '#AEAEB2' }}>
              Exempted players are never selected for matchday duties
            </span>
          </div>

          {/* Admin: Add Exemption Form */}
          {isAdmin && (
            <form
              onSubmit={handleAddExemption}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                alignItems: 'end',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#8E8E93', marginBottom: '4px', textTransform: 'uppercase' }}>
                  1. Select Team
                </label>
                <select
                  value={exemptTeamId}
                  onChange={(e) => {
                    setExemptTeamId(e.target.value);
                    setExemptPlayerId('');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#2C2C2E',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#FFFFFF',
                    fontSize: '12.5px',
                  }}
                >
                  <option value="">-- Choose Team --</option>
                  {cat?.teams?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#8E8E93', marginBottom: '4px', textTransform: 'uppercase' }}>
                  2. Select Player to Exempt
                </label>
                <select
                  value={exemptPlayerId}
                  onChange={(e) => setExemptPlayerId(e.target.value)}
                  disabled={!exemptTeamId}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#2C2C2E',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#FFFFFF',
                    fontSize: '12.5px',
                  }}
                >
                  <option value="">-- Choose Player --</option>
                  {exemptTeamId &&
                    teamsMap[exemptTeamId]?.players
                      ?.filter((p) => !p.unknown && p.name !== 'Unrecorded scorer' && !exemptedPlayerIds.has(String(p.id || p.permanentId)))
                      .map((p) => (
                        <option key={p.id || p.permanentId} value={p.id || p.permanentId}>
                          {p.name} {p.position ? `(${p.position})` : ''}
                        </option>
                      ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#8E8E93', marginBottom: '4px', textTransform: 'uppercase' }}>
                  3. Reason for Exemption
                </label>
                <select
                  value={exemptReason}
                  onChange={(e) => setExemptReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#2C2C2E',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#FFFFFF',
                    fontSize: '12.5px',
                  }}
                >
                  <option value="Medical / Injured">Medical / Injured</option>
                  <option value="Refereeing / Match Official">Refereeing / Match Official</option>
                  <option value="Club Executive Duty">Club Executive Duty</option>
                  <option value="Work / Academic Obligation">Work / Academic Obligation</option>
                  <option value="Compassionate Leave">Compassionate Leave</option>
                  <option value="Custom">Other (Specify below)</option>
                </select>
              </div>

              {exemptReason === 'Custom' && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#8E8E93', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Specify Custom Reason
                  </label>
                  <input
                    type="text"
                    placeholder="Enter reason..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: '#2C2C2E',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#FFFFFF',
                      fontSize: '12.5px',
                    }}
                  />
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={exemptSubmitting || !exemptPlayerId}
                  style={{
                    width: '100%',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#BF5AF2',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: exemptPlayerId ? 'pointer' : 'not-allowed',
                    opacity: exemptPlayerId ? 1 : 0.6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {exemptSubmitting ? 'Adding…' : '+ Add Exemption'}
                </button>
              </div>
            </form>
          )}

          {/* List of currently exempted players */}
          {exemptionsList.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#8E8E93', fontSize: '13px' }}>
              No squad members currently exempted. All players are in the active rotating duty pool.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '12px',
              }}
            >
              {exemptionsList.map((ex) => {
                const tObj = teamsMap[ex.teamId];
                return (
                  <div
                    key={ex.playerId}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      border: '1px solid rgba(191, 90, 242, 0.25)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: tObj?.color || '#BF5AF2',
                            display: 'inline-block',
                          }}
                        />
                        <span style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>
                          {ex.teamName || ex.teamId}
                        </span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: '#FFFFFF' }}>
                        {ex.playerName}
                      </div>
                      <div style={{ fontSize: '12px', color: '#BF5AF2', marginTop: '2px' }}>
                        Reason: {ex.reason || 'Exempted'}
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveExemption(ex.playerId)}
                        disabled={exemptSubmitting}
                        title="Remove exemption and restore to duty pool"
                        style={{
                          background: 'rgba(255, 69, 58, 0.15)',
                          border: '1px solid #FF453A',
                          color: '#FF453A',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Control Bar: Filters & Search */}
      <div
        className="duty-filter-bar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Segmented Filter Control */}
        <div
          className="duty-segmented-tabs"
          style={{
            display: 'flex',
            background: '#1C1C1E',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.08)',
            maxWidth: '100%',
            overflowX: 'auto',
          }}
        >
          {[
            { key: 'all', label: 'All Matchdays' },
            { key: 'pending', label: `Pending Work (${summary.pendingDuties})` },
            { key: 'completed', label: `Completed (${summary.completedDuties})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="duty-segmented-tab-btn"
              onClick={() => setActiveFilterTab(tab.key)}
              style={{
                padding: '8px 14px',
                fontSize: '12.5px',
                fontWeight: activeFilterTab === tab.key ? 700 : 500,
                borderRadius: '8px',
                border: 'none',
                background: activeFilterTab === tab.key ? '#FF9500' : 'transparent',
                color: activeFilterTab === tab.key ? '#16201B' : '#8E8E93',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                minHeight: '38px',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Team Filter & Search */}
        <div className="duty-search-group" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedTeamFilter}
            onChange={(e) => setSelectedTeamFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#1C1C1E',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F2F2F7',
              fontSize: '12.5px',
              fontWeight: 600,
              minHeight: '38px',
            }}
          >
            <option value="all">All Teams</option>
            {cat?.teams?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search player, task, date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#1C1C1E',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F2F2F7',
              fontSize: '12.5px',
              width: '200px',
              outline: 'none',
              minHeight: '38px',
            }}
          />
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && !dutyRoster && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#8E8E93' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>Loading duty roster…</div>
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'rgba(255, 69, 58, 0.1)',
            border: '1px solid #FF453A',
            borderRadius: '12px',
            padding: '16px',
            color: '#FF453A',
            marginBottom: '20px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Matchdays List */}
      {!loading && filteredDays.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: '#1C1C1E',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#8E8E93',
          }}
        >
          <span style={{ fontSize: '36px', display: 'block', marginBottom: '10px' }}>🔍</span>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#EBEBF5', marginBottom: '6px' }}>
            No duty records matching your filter
          </div>
          <div style={{ fontSize: '13px' }}>
            {activeFilterTab === 'pending'
              ? 'All tasks for this filter have been completed!'
              : 'Try clearing your search query or selecting "All Matchdays".'}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {filteredDays.map((day) => (
          <div
            key={day.dayString}
            style={{
              background: '#1C1C1E',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            }}
          >
            {/* Day Header */}
            <div
              style={{
                padding: '12px 20px',
                background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>📅</span>
                <span style={{ fontWeight: 800, fontSize: '14.5px', color: '#FFFFFF', letterSpacing: '-0.3px' }}>
                  {day.dayString}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#8E8E93', fontWeight: 600 }}>
                {day.matches.length} {day.matches.length === 1 ? 'Match' : 'Matches'} Scheduled
              </span>
            </div>

            {/* Fixture Duties for this day */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {day.matches.map((m) => {
                const isFirst = m.orderOfDay === 1;
                const dutyIcon = isFirst ? '👕' : '🥅';
                const dutyTitle = isFirst ? 'Wash Team Bibs' : 'Take Side Goalpost From & Back to Store';
                const dutyAccent = isFirst ? '#6CE5A0' : '#FF9500';

                const hDuty = m.homeTeam?.duty || {};
                const aDuty = m.awayTeam?.duty || {};

                const hCompleted = Boolean(hDuty.completed);
                const aCompleted = Boolean(aDuty.completed);

                const hTeamObj = teamsMap[m.homeTeam?.id];
                const aTeamObj = teamsMap[m.awayTeam?.id];

                const selectableHome = getSelectablePlayersForTeam(m.homeTeam?.id);
                const selectableAway = getSelectablePlayersForTeam(m.awayTeam?.id);

                return (
                  <div
                    key={m.fixtureId}
                    className="duty-fixture-card"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      padding: '16px',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Fixture Top Bar */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '14px',
                        paddingBottom: '10px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: isFirst ? 'rgba(108, 229, 160, 0.15)' : 'rgba(255, 149, 0, 0.15)',
                            color: dutyAccent,
                            border: `1px solid ${dutyAccent}`,
                            textTransform: 'uppercase',
                          }}
                        >
                          Match {m.orderOfDay}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#EBEBF5' }}>
                          {m.homeTeam?.name} <span style={{ color: '#8E8E93', fontWeight: 400 }}>vs</span> {m.awayTeam?.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: '#AEAEB2', fontWeight: 600 }}>
                          ⏰ {m.date.split(' · ')[1] || m.date}
                        </span>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(255,255,255,0.05)',
                            color: '#AEAEB2',
                          }}
                        >
                          {dutyIcon} {dutyTitle}
                        </span>
                      </div>
                    </div>

                    {/* Opposing Sides Duties Grid: Home Side & Away Side */}
                    <div
                      className="duty-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '14px',
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* HOME TEAM DUTY CARD */}
                      <div
                        className="duty-side-card"
                        style={{
                          background: hCompleted ? 'rgba(48, 209, 88, 0.05)' : 'rgba(0,0,0,0.25)',
                          borderRadius: '12px',
                          padding: '14px',
                          border: hCompleted
                            ? '1px solid rgba(48, 209, 88, 0.3)'
                            : '1px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '10px',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div style={{ width: '100%', boxSizing: 'border-box' }}>
                          {/* Div holding team name, pending work / completed badge (stretched 100%) */}
                          <div
                            className="duty-header-row"
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              width: '100%',
                              boxSizing: 'border-box',
                              marginBottom: '8px',
                              gap: '8px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 auto' }}>
                              <span
                                style={{
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  background: hTeamObj?.color || '#FF9500',
                                  display: 'inline-block',
                                  flexShrink: 0,
                                }}
                              />
                              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', wordBreak: 'break-word' }}>
                                {m.homeTeam?.name} (Home)
                              </span>
                            </div>

                            {/* Status Badge */}
                            <div style={{ flexShrink: 0, marginLeft: 'auto' }}>
                              {hCompleted ? (
                                <span
                                  style={{
                                    background: '#30D158',
                                    color: '#000000',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap',
                                    letterSpacing: '0.2px',
                                  }}
                                >
                                  ✅ COMPLETED
                                </span>
                              ) : (
                                <span
                                  style={{
                                    background: 'rgba(255, 149, 0, 0.2)',
                                    color: '#FF9500',
                                    border: '1px solid #FF9500',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    whiteSpace: 'nowrap',
                                    letterSpacing: '0.2px',
                                  }}
                                >
                                  ⏳ PENDING WORK
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Player Name & Task */}
                          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                            <span>👤 {hDuty.playerName || 'Unassigned'}</span>
                            {hDuty.playerId && exemptedPlayerIds.has(String(hDuty.playerId)) && (
                              <span style={{ fontSize: '10.5px', background: 'rgba(191,90,242,0.2)', color: '#BF5AF2', border: '1px solid #BF5AF2', padding: '1px 6px', borderRadius: '4px' }}>
                                🛡️ EXEMPTED
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            {hDuty.task || (isFirst ? `Wash ${m.homeTeam?.name} Bibs` : `Take ${m.homeTeam?.name} Side Goalpost from and back to the Store`)}
                          </div>
                          {hCompleted && hDuty.completedAt && (
                            <div style={{ fontSize: '11px', color: '#30D158', marginTop: '4px' }}>
                              Done: {new Date(hDuty.completedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>

                        {/* Admin Controls */}
                        {isAdmin && (
                          <div
                            className="duty-admin-row"
                            style={{
                              marginTop: '10px',
                              paddingTop: '10px',
                              borderTop: '1px solid rgba(255,255,255,0.06)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              flexWrap: 'wrap',
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          >
                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                fontSize: '12.5px',
                                fontWeight: 700,
                                color: hCompleted ? '#30D158' : '#FF9500',
                                minHeight: '44px',
                                padding: '2px 0',
                                userSelect: 'none',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={hCompleted}
                                disabled={savingKey === `${m.fixtureId}-home`}
                                onChange={() => handleToggleCompletion(m.fixtureId, 'home', hCompleted)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#30D158', flexShrink: 0 }}
                              />
                              <span>{hCompleted ? 'Work Completed' : 'Tick When Done'}</span>
                            </label>

                            {/* Reassign Dropdown (excludes players who have already completed duty!) */}
                            {!hCompleted && (
                              <select
                                value={hDuty.playerId || ''}
                                onChange={(e) => {
                                  const pId = e.target.value;
                                  const pObj = selectableHome.find((p) => (p.id || p.permanentId) === pId);
                                  handleAssignPlayer(m.fixtureId, 'home', pId, pObj?.name || '');
                                }}
                                style={{
                                  fontSize: '12px',
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  background: '#1C1C1E',
                                  color: '#EBEBF5',
                                  border: '1px solid rgba(255,255,255,0.18)',
                                  minHeight: '40px',
                                  maxWidth: '100%',
                                  cursor: 'pointer',
                                }}
                              >
                                <option value="">-- Change Player --</option>
                                {selectableHome.map((p) => (
                                  <option key={p.id || p.permanentId} value={p.id || p.permanentId}>
                                    {p.name} {p.position ? `(${p.position})` : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </div>

                      {/* AWAY TEAM DUTY CARD */}
                      <div
                        className="duty-side-card"
                        style={{
                          background: aCompleted ? 'rgba(48, 209, 88, 0.05)' : 'rgba(0,0,0,0.25)',
                          borderRadius: '12px',
                          padding: '14px',
                          border: aCompleted
                            ? '1px solid rgba(48, 209, 88, 0.3)'
                            : '1px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '10px',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div style={{ width: '100%', boxSizing: 'border-box' }}>
                          {/* Div holding team name, pending work / completed badge (stretched 100%) */}
                          <div
                            className="duty-header-row"
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              width: '100%',
                              boxSizing: 'border-box',
                              marginBottom: '8px',
                              gap: '8px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 auto' }}>
                              <span
                                style={{
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  background: aTeamObj?.color || '#3F7A4E',
                                  display: 'inline-block',
                                  flexShrink: 0,
                                }}
                              />
                              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', wordBreak: 'break-word' }}>
                                {m.awayTeam?.name} (Away)
                              </span>
                            </div>

                            {/* Status Badge */}
                            <div style={{ flexShrink: 0, marginLeft: 'auto' }}>
                              {aCompleted ? (
                                <span
                                  style={{
                                    background: '#30D158',
                                    color: '#000000',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap',
                                    letterSpacing: '0.2px',
                                  }}
                                >
                                  ✅ COMPLETED
                                </span>
                              ) : (
                                <span
                                  style={{
                                    background: 'rgba(255, 149, 0, 0.2)',
                                    color: '#FF9500',
                                    border: '1px solid #FF9500',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    whiteSpace: 'nowrap',
                                    letterSpacing: '0.2px',
                                  }}
                                >
                                  ⏳ PENDING WORK
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Player Name & Task */}
                          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                            <span>👤 {aDuty.playerName || 'Unassigned'}</span>
                            {aDuty.playerId && exemptedPlayerIds.has(String(aDuty.playerId)) && (
                              <span style={{ fontSize: '10.5px', background: 'rgba(191,90,242,0.2)', color: '#BF5AF2', border: '1px solid #BF5AF2', padding: '1px 6px', borderRadius: '4px' }}>
                                🛡️ EXEMPTED
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            {aDuty.task || (isFirst ? `Wash ${m.awayTeam?.name} Bibs` : `Take ${m.awayTeam?.name} Side Goalpost from and back to the Store`)}
                          </div>
                          {aCompleted && aDuty.completedAt && (
                            <div style={{ fontSize: '11px', color: '#30D158', marginTop: '4px' }}>
                              Done: {new Date(aDuty.completedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>

                        {/* Admin Controls */}
                        {isAdmin && (
                          <div
                            className="duty-admin-row"
                            style={{
                              marginTop: '10px',
                              paddingTop: '10px',
                              borderTop: '1px solid rgba(255,255,255,0.06)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              flexWrap: 'wrap',
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          >
                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                fontSize: '12.5px',
                                fontWeight: 700,
                                color: aCompleted ? '#30D158' : '#FF9500',
                                minHeight: '44px',
                                padding: '2px 0',
                                userSelect: 'none',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={aCompleted}
                                disabled={savingKey === `${m.fixtureId}-away`}
                                onChange={() => handleToggleCompletion(m.fixtureId, 'away', aCompleted)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#30D158', flexShrink: 0 }}
                              />
                              <span>{aCompleted ? 'Work Completed' : 'Tick When Done'}</span>
                            </label>

                            {/* Reassign Dropdown (excludes players who have already completed duty!) */}
                            {!aCompleted && (
                              <select
                                value={aDuty.playerId || ''}
                                onChange={(e) => {
                                  const pId = e.target.value;
                                  const pObj = selectableAway.find((p) => (p.id || p.permanentId) === pId);
                                  handleAssignPlayer(m.fixtureId, 'away', pId, pObj?.name || '');
                                }}
                                style={{
                                  fontSize: '12px',
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  background: '#1C1C1E',
                                  color: '#EBEBF5',
                                  border: '1px solid rgba(255,255,255,0.18)',
                                  minHeight: '40px',
                                  maxWidth: '100%',
                                  cursor: 'pointer',
                                }}
                              >
                                <option value="">-- Change Player --</option>
                                {selectableAway.map((p) => (
                                  <option key={p.id || p.permanentId} value={p.id || p.permanentId}>
                                    {p.name} {p.position ? `(${p.position})` : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
