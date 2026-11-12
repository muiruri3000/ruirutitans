import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';

const POSITION_OPTIONS = [
  { value: '', label: 'Any / Unassigned' },
  { value: 'GK', label: 'Goalkeeper (GK)' },
  { value: 'LB', label: 'Left Back (LB)' },
  { value: 'CB', label: 'Center Back (CB)' },
  { value: 'RB', label: 'Right Back (RB)' },
  { value: 'CDM', label: 'Defensive Midfielder (CDM)' },
  { value: 'CM', label: 'Central Midfielder (CM)' },
  { value: 'LW', label: 'Left Winger (LW)' },
  { value: 'RW', label: 'Right Winger (RW)' },
  { value: 'ST', label: 'Striker (ST)' },
];

export default function TransfersView({
  categories = {},
  activeCategoryKey,
  cmsUser,
  playerUser,
  isCmsMode = false,
  onOpenAuthModal,
  onCategoryChanged,
  onRefreshState,
}) {
  const [selectedCategoryKey, setSelectedCategoryKey] = useState(
    activeCategoryKey || Object.keys(categories)[0] || 'ruiru-titans-league-oct-nov-2026'
  );

  useEffect(() => {
    if (activeCategoryKey && categories[activeCategoryKey]) {
      setSelectedCategoryKey(activeCategoryKey);
    }
  }, [activeCategoryKey, categories]);

  const currentCategory = categories[selectedCategoryKey] || Object.values(categories)[0];

  const [loading, setLoading] = useState(false);
  const [transfersData, setTransfersData] = useState({
    completed_transfers: [],
    pending_transfers: [],
    rejected_transfers: [],
    free_agents: [],
    transfer_window_open: true,
    my_pending_transfer: null,
  });
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filter / Search
  const [searchQuery, setSearchQuery] = useState('');

  // Player Transfer Request Form State
  const [targetTeamId, setTargetTeamId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferType, setTransferType] = useState(playerUser && !playerUser.team_id ? 'free' : 'permanent');
  const [submittingReq, setSubmittingReq] = useState(false);

  useEffect(() => {
    if (playerUser && !playerUser.team_id) {
      setTransferType('free');
    } else {
      setTransferType('permanent');
    }
  }, [playerUser]);

  // Admin Direct Transfer State
  const [directPlayerId, setDirectPlayerId] = useState('');
  const [directToTeamId, setDirectToTeamId] = useState('');
  const [directNotes, setDirectNotes] = useState('');
  const [directType, setDirectType] = useState('permanent');
  const [directSubmitting, setDirectSubmitting] = useState(false);

  // Admin Add Free Agent State
  const [faFirstName, setFaFirstName] = useState('');
  const [faSurname, setFaSurname] = useState('');
  const [faPosition, setFaPosition] = useState('');
  const [faJerseyNumber, setFaJerseyNumber] = useState('');
  const [faToTeamId, setFaToTeamId] = useState('');
  const [faNotes, setFaNotes] = useState('');
  const [faSubmitting, setFaSubmitting] = useState(false);
  const [faCreatedInfo, setFaCreatedInfo] = useState(null);

  // Quick Move Free Agent State (per free agent id)
  const [faMoveTargets, setFaMoveTargets] = useState({});
  const [faMovingId, setFaMovingId] = useState(null);

  // Admin Action State
  const [actionNotes, setActionNotes] = useState({});
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const isAdmin = Boolean(isCmsMode || cmsUser);

  const fetchTransfers = async () => {
    if (!selectedCategoryKey) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.getTransfers(selectedCategoryKey);
      setTransfersData({
        completed_transfers: data.completed_transfers || [],
        pending_transfers: data.pending_transfers || [],
        rejected_transfers: data.rejected_transfers || [],
        free_agents: data.free_agents || [],
        transfer_window_open: data.transfer_window_open !== undefined ? data.transfer_window_open : true,
        my_pending_transfer: data.my_pending_transfer || null,
      });
    } catch (err) {
      console.error('Failed to load transfers:', err);
      setErrorMsg(err.message || 'Failed to load transfer records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, [selectedCategoryKey]);

  // Teams in current category
  const teams = useMemo(() => {
    return currentCategory?.teams || [];
  }, [currentCategory]);

  // All players in current category (team players + free agents for admin direct transfer)
  const allCategoryPlayers = useMemo(() => {
    const list = [];
    const seenIds = new Set();
    teams.forEach((t) => {
      (t.players || []).forEach((p) => {
        if (!p.unknown && p.id && !seenIds.has(p.id)) {
          seenIds.add(p.id);
          list.push({
            ...p,
            teamId: t.id,
            teamName: t.name,
            teamColor: t.color,
            isFreeAgent: false,
          });
        }
      });
    });
    (transfersData.free_agents || []).forEach((fa) => {
      if (fa.id && !seenIds.has(fa.id)) {
        seenIds.add(fa.id);
        list.push({
          ...fa,
          teamId: null,
          teamName: 'Free Agent',
          teamColor: '#8E8E93',
          isFreeAgent: true,
        });
      }
    });
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [teams, transfersData.free_agents]);

  const selectedDirectPlayer = useMemo(() => {
    return allCategoryPlayers.find((p) => p.id === directPlayerId) || null;
  }, [allCategoryPlayers, directPlayerId]);

  // Toggle Transfer Window
  const handleToggleWindow = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.toggleTransferWindow(selectedCategoryKey, {});
      setTransfersData((prev) => ({
        ...prev,
        transfer_window_open: res.transfer_window_open,
      }));
      setSuccessMsg(res.message || 'Transfer window updated.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to toggle transfer window.');
    }
  };

  // Submit Player Transfer Request
  const handleSubmitPlayerRequest = async (e) => {
    e.preventDefault();
    if (!targetTeamId) {
      setErrorMsg('Please select a destination club.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmittingReq(true);
    try {
      const payload = {
        to_team_id: targetTeamId,
        reason: transferReason,
        transfer_type: transferType,
      };
      if (playerUser) {
        payload.player_id = playerUser.player_id || playerUser.id;
      }
      const res = await api.submitTransferRequest(selectedCategoryKey, payload);
      setSuccessMsg(res.message || 'Transfer request submitted successfully. Club administration will review your request.');
      setTransferReason('');
      setTargetTeamId('');
      fetchTransfers();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit transfer request.');
    } finally {
      setSubmittingReq(false);
    }
  };

  // Admin Approve / Reject Action
  const handleTransferAction = async (transferId, action) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setActionLoadingId(transferId);
    try {
      const notes = actionNotes[transferId] || '';
      const res = await api.actionTransferRequest(selectedCategoryKey, transferId, {
        action,
        admin_notes: notes,
      });
      setSuccessMsg(res.message || `Transfer request ${action}ed.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await fetchTransfers();
      if (action === 'approve' && onRefreshState) {
        await onRefreshState();
      }
    } catch (err) {
      setErrorMsg(err.message || `Failed to ${action} transfer request.`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Admin Direct Transfer
  const handleDirectTransfer = async (e) => {
    e.preventDefault();
    if (!directPlayerId || !directToTeamId) {
      setErrorMsg('Please select both a player and a destination club.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setDirectSubmitting(true);
    try {
      const effectiveType = selectedDirectPlayer?.isFreeAgent ? 'free' : directType;
      const res = await api.directTransfer(selectedCategoryKey, {
        player_id: directPlayerId,
        to_team_id: directToTeamId,
        notes: directNotes,
        transfer_type: effectiveType,
      });
      setSuccessMsg(res.message || 'Player successfully transferred to new club!');
      setDirectPlayerId('');
      setDirectToTeamId('');
      setDirectNotes('');
      await fetchTransfers();
      if (onRefreshState) {
        await onRefreshState();
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to complete direct transfer.');
    } finally {
      setDirectSubmitting(false);
    }
  };

  // Admin Add Free Agent
  const handleAddFreeAgent = async (e) => {
    e.preventDefault();
    if (!faFirstName.trim()) {
      setErrorMsg('Please enter the free agent\'s first name.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setFaCreatedInfo(null);
    setFaSubmitting(true);
    try {
      const payload = {
        first_name: faFirstName.trim(),
        surname: faSurname.trim(),
        position: faPosition,
        jersey_number: faJerseyNumber.trim() || null,
        to_team_id: faToTeamId || null,
        notes: faNotes.trim(),
      };
      const res = await api.addFreeAgent(selectedCategoryKey, payload);
      setSuccessMsg(res.message || 'Free agent added successfully.');
      setFaCreatedInfo({
        player: res.player,
        code: res.code,
        username: res.username,
        transfer: res.transfer,
      });
      setFaFirstName('');
      setFaSurname('');
      setFaPosition('');
      setFaJerseyNumber('');
      setFaToTeamId('');
      setFaNotes('');
      await fetchTransfers();
      if (res.transfer && onRefreshState) {
        await onRefreshState();
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to add free agent.');
    } finally {
      setFaSubmitting(false);
    }
  };

  // Admin Quick Move Free Agent to Any Existing Team
  const handleMoveFreeAgent = async (freeAgentId) => {
    const destTeamId = faMoveTargets[freeAgentId];
    if (!destTeamId) {
      setErrorMsg('Please select an existing team to move this free agent to.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setFaMovingId(freeAgentId);
    try {
      const res = await api.directTransfer(selectedCategoryKey, {
        player_id: freeAgentId,
        to_team_id: destTeamId,
        transfer_type: 'free',
        notes: 'Free agent signed to existing squad',
      });
      setSuccessMsg(res.message || 'Free agent moved to team successfully!');
      setFaMoveTargets((prev) => {
        const next = { ...prev };
        delete next[freeAgentId];
        return next;
      });
      await fetchTransfers();
      if (onRefreshState) {
        await onRefreshState();
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to move free agent.');
    } finally {
      setFaMovingId(null);
    }
  };

  // Filter completed transfers
  const filteredCompleted = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return transfersData.completed_transfers;
    return transfersData.completed_transfers.filter((t) => {
      const pName = (t.player?.name || t.player?.displayName || '').toLowerCase();
      const fromName = (t.from_team?.name || '').toLowerCase();
      const toName = (t.to_team?.name || '').toLowerCase();
      return pName.includes(q) || fromName.includes(q) || toName.includes(q);
    });
  }, [transfersData.completed_transfers, searchQuery]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Category & Status Bar */}
      <div
        style={{
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '22px 24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '24px' }}>🔄</span>
            <h2 className="scoreboard" style={{ margin: 0, fontSize: '26px', color: '#FF9500', letterSpacing: '0.04em' }}>
              OFFICIAL SQUAD TRANSFERS
            </h2>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                padding: '4px 10px',
                borderRadius: '999px',
                background: transfersData.transfer_window_open ? 'rgba(48, 209, 88, 0.16)' : 'rgba(255, 69, 58, 0.16)',
                border: `1px solid ${transfersData.transfer_window_open ? '#30D158' : '#FF453A'}`,
                color: transfersData.transfer_window_open ? '#30D158' : '#FF453A',
                textTransform: 'uppercase',
              }}
            >
              {transfersData.transfer_window_open ? '🟢 Window Open' : '🔴 Window Closed'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#8E8E93' }}>
            Official registry of club player transfers, loan agreements, and player squad movement.
          </p>
        </div>

        {/* Category selector & Admin toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {Object.keys(categories).length > 1 && (
            <select
              className="form-input"
              style={{ width: 'auto', minWidth: '180px', padding: '8px 12px', fontSize: '13px' }}
              value={selectedCategoryKey}
              onChange={(e) => {
                setSelectedCategoryKey(e.target.value);
                if (onCategoryChanged) onCategoryChanged(e.target.value);
              }}
            >
              {Object.entries(categories).map(([k, c]) => (
                <option key={k} value={k}>
                  {c.label || k}
                </option>
              ))}
            </select>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleToggleWindow}
              style={{
                background: transfersData.transfer_window_open ? 'rgba(255, 69, 58, 0.2)' : 'rgba(48, 209, 88, 0.2)',
                border: `1px solid ${transfersData.transfer_window_open ? '#FF453A' : '#30D158'}`,
                color: transfersData.transfer_window_open ? '#FF453A' : '#30D158',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{transfersData.transfer_window_open ? '🔒 Close Transfer Window' : '🔓 Open Transfer Window'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Alert Banners */}
      {errorMsg && (
        <div
          style={{
            background: 'rgba(255, 69, 58, 0.15)',
            border: '1px solid #FF453A',
            color: '#FF6961',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '13.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>⚠️</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            background: 'rgba(48, 209, 88, 0.15)',
            border: '1px solid #30D158',
            color: '#30D158',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '13.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>✅</span>
          <span>{successMsg}</span>
        </div>
      )}

      {/* Transfer Window Status Rules Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.08) 0%, rgba(18, 18, 18, 0.95) 100%)',
          border: '1px solid rgba(255, 149, 0, 0.25)',
          borderRadius: '14px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FF9500', fontWeight: 700, fontSize: '14px' }}>
          <span>📜</span>
          <span>Titans Transfer Regulations &amp; Eligibility Protocol</span>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#C7C7CC', lineHeight: '1.5' }}>
          {transfersData.transfer_window_open
            ? 'The transfer window is currently OPEN. Players requesting squad transfers must hand in an official transfer request to club administration. Once approved by the admin, the player is immediately transferred and certified eligible to compete for their new squad.'
            : 'The transfer window is currently CLOSED. Squad rosters are locked for active tournament play. Only club administration may execute exceptional squad movements.'}
        </p>
      </div>

      {/* Player Transfer Request Submission Section */}
      {playerUser ? (
        <div
          style={{
            background: '#121212',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '20px 24px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 className="scoreboard" style={{ margin: 0, fontSize: '20px', color: '#FF9500' }}>
              👤 SUBMIT A SQUAD TRANSFER REQUEST
            </h3>
            <span style={{ fontSize: '12px', color: '#8E8E93' }}>
              Logged in as: <strong style={{ color: '#fff' }}>{playerUser.name || playerUser.username}</strong> ({playerUser.team_name || 'Free Agent'})
            </span>
          </div>

          {transfersData.my_pending_transfer ? (
            <div
              style={{
                background: 'rgba(255, 149, 0, 0.12)',
                border: '1px solid rgba(255, 149, 0, 0.35)',
                borderRadius: '12px',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FF9500', fontWeight: 700, fontSize: '14px' }}>
                <span>⏳</span>
                <span>Active Transfer Request Pending Administration Approval</span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#E5E5EA' }}>
                Your request to transfer to <strong style={{ color: '#FF9500' }}>{transfersData.my_pending_transfer.to_team?.name}</strong> was submitted on{' '}
                {new Date(transfersData.my_pending_transfer.created_at).toLocaleDateString()}. Club administration will review your request shortly.
              </p>
              {transfersData.my_pending_transfer.request_reason && (
                <div style={{ fontSize: '12.5px', color: '#8E8E93', fontStyle: 'italic' }}>
                  Reason provided: "{transfersData.my_pending_transfer.request_reason}"
                </div>
              )}
            </div>
          ) : !transfersData.transfer_window_open ? (
            <div style={{ fontSize: '13px', color: '#8E8E93', padding: '12px 0' }}>
              Transfer window is currently closed. New player transfer requests cannot be submitted at this time.
            </div>
          ) : (
            <form onSubmit={handleSubmitPlayerRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#C7C7CC', marginBottom: '6px' }}>
                    Destination Club *
                  </label>
                  <select
                    className="form-input"
                    value={targetTeamId}
                    onChange={(e) => setTargetTeamId(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  >
                    <option value="">Select Target Team…</option>
                    {teams
                      .filter((t) => t.id !== playerUser.team_id && t.name !== playerUser.team_name)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#C7C7CC', marginBottom: '6px' }}>
                    Transfer Type
                  </label>
                  <select
                    className="form-input"
                    value={transferType}
                    onChange={(e) => setTransferType(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="permanent">Permanent Squad Transfer</option>
                    <option value="loan">Seasonal Loan Agreement</option>
                    <option value="free">Free Agent Signing</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#C7C7CC', marginBottom: '6px' }}>
                  Reason for Transfer Request (handed in to Admin)
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="State reason for requested squad move (e.g. tactical fit, scheduling, mutual agreement)…"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={submittingReq || !targetTeamId}
                  className="stat-btn"
                  style={{
                    background: '#FF9500',
                    color: '#16201B',
                    fontWeight: 800,
                    padding: '10px 24px',
                    borderRadius: '8px',
                    opacity: submittingReq || !targetTeamId ? 0.6 : 1,
                  }}
                >
                  {submittingReq ? 'Submitting Request…' : '📤 Hand In Transfer Request'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div
          style={{
            background: '#121212',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
            borderRadius: '14px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>ℹ️</span>
            <span style={{ fontSize: '13px', color: '#C7C7CC' }}>
              Are you a registered player looking to change squads? Sign in to submit your transfer request to club administration.
            </span>
          </div>
          {onOpenAuthModal && (
            <button
              type="button"
              onClick={() => onOpenAuthModal('player')}
              style={{
                background: 'rgba(255, 149, 0, 0.15)',
                border: '1px solid #FF9500',
                color: '#FF9500',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Sign In as Player
            </button>
          )}
        </div>
      )}

      {/* Admin Transfer Management Panel */}
      {isAdmin && (
        <div
          style={{
            background: '#161618',
            border: '1px solid rgba(255, 149, 0, 0.3)',
            borderRadius: '16px',
            padding: '22px 24px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🛡️</span>
              <h3 className="scoreboard" style={{ margin: 0, fontSize: '20px', color: '#FF9500' }}>
                ADMINISTRATIVE TRANSFER CONTROLS
              </h3>
            </div>
            <span
              style={{
                fontSize: '11px',
                background: 'rgba(255, 149, 0, 0.15)',
                color: '#FF9500',
                padding: '3px 8px',
                borderRadius: '6px',
                fontWeight: 700,
              }}
            >
              Pending Requests: {(transfersData.pending_transfers || []).length}
            </span>
          </div>

          {/* Pending Transfer Requests Table */}
          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📥</span>
              <span>Pending Player Requests Awaiting Review</span>
            </h4>

            {(!transfersData.pending_transfers || transfersData.pending_transfers.length === 0) ? (
              <div style={{ fontSize: '13px', color: '#8E8E93', padding: '14px 0', textAlign: 'center', background: '#121212', borderRadius: '10px' }}>
                No pending transfer requests submitted for this competition.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {transfersData.pending_transfers.map((req) => {
                  const isLoading = actionLoadingId === req.id;
                  return (
                    <div
                      key={req.id}
                      style={{
                        background: '#121212',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                            {req.player?.displayName || req.player?.name}
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#8E8E93', marginLeft: '6px' }}>
                              ({req.player?.position || 'Player'})
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginTop: '4px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: req.from_team?.color || '#FF9500' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: req.from_team?.color || '#FF9500' }} />
                              <strong>{req.from_team?.name}</strong>
                            </span>
                            <span style={{ color: '#8E8E93' }}>➔</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: req.to_team?.color || '#30D158' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: req.to_team?.color || '#30D158' }} />
                              <strong>{req.to_team?.name}</strong>
                            </span>
                            <span style={{ fontSize: '11px', color: '#8E8E93' }}>
                              • Type: {req.transfer_type || 'permanent'}
                            </span>
                          </div>
                          {req.request_reason && (
                            <div style={{ fontSize: '12.5px', color: '#C7C7CC', marginTop: '6px', fontStyle: 'italic' }}>
                              Reason: "{req.request_reason}"
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: '#636366', marginTop: '4px' }}>
                            Submitted: {new Date(req.created_at).toLocaleString()}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '220px' }}>
                          <input
                            type="text"
                            placeholder="Admin notes (optional)…"
                            className="form-input"
                            style={{ fontSize: '12px', padding: '6px 8px' }}
                            value={actionNotes[req.id] || ''}
                            onChange={(e) =>
                              setActionNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleTransferAction(req.id, 'approve')}
                              style={{
                                flex: 1,
                                background: '#30D158',
                                color: '#000',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '8px',
                                fontSize: '12px',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              {isLoading ? 'Processing…' : '✓ Approve'}
                            </button>
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleTransferAction(req.id, 'reject')}
                              style={{
                                flex: 1,
                                background: 'rgba(255, 69, 58, 0.2)',
                                border: '1px solid #FF453A',
                                color: '#FF6961',
                                borderRadius: '6px',
                                padding: '8px',
                                fontSize: '12px',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              ✕ Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Direct Admin Transfer */}
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚡</span>
              <span>Execute Direct Administrative Squad Move</span>
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#8E8E93' }}>
              Instantly reassign a club player or free agent to any existing team in this competition without requiring a prior request.
            </p>

            <form onSubmit={handleDirectTransfer} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
              <select
                className="form-input"
                value={directPlayerId}
                onChange={(e) => setDirectPlayerId(e.target.value)}
                required
                style={{ fontSize: '13px' }}
              >
                <option value="">Select Player or Free Agent…</option>
                {allCategoryPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.displayName} ({p.teamName})
                  </option>
                ))}
              </select>

              <select
                className="form-input"
                value={directToTeamId}
                onChange={(e) => setDirectToTeamId(e.target.value)}
                required
                style={{ fontSize: '13px' }}
              >
                <option value="">Destination Club…</option>
                {teams
                  .filter((t) => !selectedDirectPlayer?.teamId || t.id !== selectedDirectPlayer.teamId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>

              <input
                type="text"
                placeholder="Reason / Administrative note…"
                className="form-input"
                value={directNotes}
                onChange={(e) => setDirectNotes(e.target.value)}
                style={{ fontSize: '13px' }}
              />

              <button
                type="submit"
                disabled={directSubmitting || !directPlayerId || !directToTeamId}
                className="stat-btn"
                style={{
                  background: '#FF9500',
                  color: '#16201B',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  borderRadius: '8px',
                  opacity: directSubmitting || !directPlayerId || !directToTeamId ? 0.6 : 1,
                }}
              >
                {directSubmitting ? 'Transferring…' : 'Execute Transfer'}
              </button>
            </form>
          </div>

          {/* Add Free Agent */}
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🆕</span>
              <span>Add Free Agent</span>
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#8E8E93' }}>
              Add an unattached free agent who can move to any of the existing teams (now or anytime later from the Free Agents pool).
            </p>

            {faCreatedInfo && (
              <div
                style={{
                  background: 'rgba(48, 209, 88, 0.12)',
                  border: '1px solid rgba(48, 209, 88, 0.4)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ fontSize: '12.5px', color: '#E5E5EA' }}>
                  <div style={{ fontWeight: 800, color: '#30D158', marginBottom: '2px' }}>
                    ✅ {faCreatedInfo.player?.name} ({faCreatedInfo.player?.id})
                    {faCreatedInfo.transfer?.to_team?.name ? ` → Signed to ${faCreatedInfo.transfer.to_team.name}` : ' · Added to Free Agents Pool'}
                  </div>
                  <div>
                    Username: <strong style={{ color: '#fff' }}>@{faCreatedInfo.username}</strong> · 4-Digit Code:{' '}
                    <strong style={{ color: '#FF9500', letterSpacing: '2px' }}>{faCreatedInfo.code}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFaCreatedInfo(null)}
                  style={{
                    background: '#1C1C1E',
                    color: '#8E8E93',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Dismiss ✕
                </button>
              </div>
            )}

            <form onSubmit={handleAddFreeAgent} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="First Name *"
                  value={faFirstName}
                  onChange={(e) => setFaFirstName(e.target.value)}
                  required
                  style={{ fontSize: '13px' }}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Surname (optional)"
                  value={faSurname}
                  onChange={(e) => setFaSurname(e.target.value)}
                  style={{ fontSize: '13px' }}
                />
                <select
                  className="form-input"
                  value={faPosition}
                  onChange={(e) => setFaPosition(e.target.value)}
                  style={{ fontSize: '13px' }}
                >
                  {POSITION_OPTIONS.map((opt) => (
                    <option key={opt.value || 'any'} value={opt.value}>
                      Position: {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={999}
                  className="form-input"
                  placeholder="Jersey # (optional)"
                  value={faJerseyNumber}
                  onChange={(e) => setFaJerseyNumber(e.target.value)}
                  style={{ fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
                <select
                  className="form-input"
                  value={faToTeamId}
                  onChange={(e) => setFaToTeamId(e.target.value)}
                  style={{ fontSize: '13px' }}
                >
                  <option value="">Keep in Free Agents Pool (Unassigned)</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      Move Immediately To: {t.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  className="form-input"
                  placeholder="Administrative note (optional)…"
                  value={faNotes}
                  onChange={(e) => setFaNotes(e.target.value)}
                  style={{ fontSize: '13px' }}
                />

                <button
                  type="submit"
                  disabled={faSubmitting || !faFirstName.trim()}
                  className="stat-btn"
                  style={{
                    background: '#30D158',
                    color: '#0B1A10',
                    fontWeight: 800,
                    fontSize: '12.5px',
                    borderRadius: '8px',
                    opacity: faSubmitting || !faFirstName.trim() ? 0.6 : 1,
                  }}
                >
                  {faSubmitting ? 'Adding Free Agent…' : faToTeamId ? '➕ Add & Move to Team' : '➕ Add Free Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Free Agents Pool (Publicly visible when free agents exist or to Admin) */}
      {(isAdmin || (transfersData.free_agents || []).length > 0) && (
        <section
          style={{
            background: '#121212',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '22px 24px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 className="scoreboard" style={{ margin: 0, fontSize: '20px', color: '#64D2FF', letterSpacing: '0.04em' }}>
                🏃 AVAILABLE FREE AGENTS
              </h3>
              <span style={{ fontSize: '12px', color: '#8E8E93' }}>
                Unattached players eligible to move to any existing team in {currentCategory?.label || 'this competition'} ({(transfersData.free_agents || []).length})
              </span>
            </div>
          </div>

          {(transfersData.free_agents || []).length === 0 ? (
            <div style={{ fontSize: '13px', color: '#8E8E93', padding: '16px', textAlign: 'center', background: '#161618', borderRadius: '10px', border: '1px dashed rgba(255, 255, 255, 0.08)' }}>
              No free agents currently in the pool. Use &ldquo;Add Free Agent&rdquo; above to register an unattached player.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {(transfersData.free_agents || []).map((fa) => {
                const isMoving = faMovingId === fa.id;
                const chosenTeam = faMoveTargets[fa.id] || '';
                return (
                  <div
                    key={fa.id}
                    style={{
                      background: '#161618',
                      border: '1px solid rgba(100, 210, 255, 0.25)',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                          {fa.name}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#8E8E93', marginTop: '2px' }}>
                          {fa.position || 'Any Position'}
                          {fa.jerseyNumber ? ` · #${fa.jerseyNumber}` : ''}
                          {` · ID: ${fa.id}`}
                          {fa.username ? ` · @${fa.username}` : ''}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '999px',
                          background: 'rgba(100, 210, 255, 0.15)',
                          color: '#64D2FF',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Free Agent
                      </span>
                    </div>

                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select
                          className="form-input"
                          value={chosenTeam}
                          onChange={(e) =>
                            setFaMoveTargets((prev) => ({ ...prev, [fa.id]: e.target.value }))
                          }
                          style={{ flex: 1, fontSize: '12.5px', padding: '7px 10px' }}
                        >
                          <option value="">Move to existing team…</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={isMoving || !chosenTeam}
                          onClick={() => handleMoveFreeAgent(fa.id)}
                          style={{
                            background: '#30D158',
                            color: '#0B1A10',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: isMoving || !chosenTeam ? 'not-allowed' : 'pointer',
                            opacity: isMoving || !chosenTeam ? 0.55 : 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isMoving ? 'Moving…' : 'Move to Team'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Completed Transfers Ledger (Publicly Visible) */}
      <section
        style={{
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 className="scoreboard" style={{ margin: 0, fontSize: '22px', color: '#fff', letterSpacing: '0.04em' }}>
              OFFICIAL COMPLETED TRANSFERS
            </h3>
            <span style={{ fontSize: '12px', color: '#8E8E93' }}>
              Public record of approved squad movements for {currentCategory?.label || 'this competition'} ({filteredCompleted.length} total)
            </span>
          </div>

          <input
            type="text"
            className="form-input"
            placeholder="Search by player or club…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '240px', fontSize: '13px', padding: '8px 12px' }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#8E8E93' }}>
            Loading completed transfers…
          </div>
        ) : filteredCompleted.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '36px 16px',
              color: '#8E8E93',
              background: '#161618',
              borderRadius: '12px',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#C7C7CC' }}>
              No completed transfers found.
            </div>
            <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}>
              Transfers approved by administration during the window will appear on this official ledger.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.12)', color: '#8E8E93', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                  <th style={{ padding: '10px 12px' }}>Player</th>
                  <th style={{ padding: '10px 12px' }}>Former Club</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>➔</th>
                  <th style={{ padding: '10px 12px' }}>New Club</th>
                  <th style={{ padding: '10px 12px' }}>Type</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompleted.map((t, idx) => (
                  <tr
                    key={t.id || idx}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <td style={{ padding: '12px', color: '#8E8E93', whiteSpace: 'nowrap' }}>
                      {t.effective_date || (t.approved_at ? new Date(t.approved_at).toLocaleDateString() : 'Official')}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 800, color: '#fff' }}>
                        {t.player?.displayName || t.player?.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                        {t.player?.position || 'Player'}
                        {t.player?.jersey_number ? ` · #${t.player.jersey_number}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '9px',
                            height: '9px',
                            borderRadius: '50%',
                            background: t.from_team?.color || '#FF9500',
                          }}
                        />
                        <span style={{ fontWeight: 600, color: '#E5E5EA' }}>{t.from_team?.name}</span>
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#30D158', fontWeight: 800 }}>
                      ➔
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '9px',
                            height: '9px',
                            borderRadius: '50%',
                            background: t.to_team?.color || '#30D158',
                          }}
                        />
                        <span style={{ fontWeight: 700, color: '#30D158' }}>{t.to_team?.name}</span>
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background:
                            t.transfer_type === 'loan'
                              ? 'rgba(90, 200, 250, 0.15)'
                              : t.transfer_type === 'free'
                                ? 'rgba(100, 210, 255, 0.15)'
                                : 'rgba(255, 149, 0, 0.15)',
                          color:
                            t.transfer_type === 'loan'
                              ? '#5AC8FA'
                              : t.transfer_type === 'free'
                                ? '#64D2FF'
                                : '#FF9500',
                          textTransform: 'capitalize',
                        }}
                      >
                        {t.transfer_type === 'free' ? 'Free Agent' : (t.transfer_type || 'Permanent')}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'rgba(48, 209, 88, 0.15)',
                          color: '#30D158',
                        }}
                      >
                        ✓ Certified
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
