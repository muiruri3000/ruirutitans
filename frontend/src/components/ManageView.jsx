import React, { useState } from 'react';

const POSITIONS = [
  { value: '', label: 'No position set' },
  { value: 'GK', label: 'Goalkeeper (GK)' },
  { value: 'DEF', label: 'Defender (DEF)' },
  { value: 'MID', label: 'Midfielder (MID)' },
  { value: 'FWD', label: 'Forward (FWD)' },
];

export default function ManageView({
  cat,
  activeCategoryKey,
  onAddTeam,
  onAddPlayers,
  onRemovePlayer,
  onAddReferee,
  onRemoveReferee,
  onDeleteCategory,
  onResetRealSeason,
}) {
  const [newTeamName, setNewTeamName] = useState('');
  const [openTeamIds, setOpenTeamIds] = useState({});
  const [newPlayerNames, setNewPlayerNames] = useState({});
  const [newRefName, setNewRefName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleTeam = (tId) => {
    setOpenTeamIds((prev) => ({ ...prev, [tId]: !prev[tId] }));
  };

  const handleAddTeam = (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    onAddTeam(newTeamName.trim());
    setNewTeamName('');
  };

  const handleAddPlayer = (teamId) => {
    const raw = (newPlayerNames[teamId] || '').trim();
    if (!raw) return;
    const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
    onAddPlayers(teamId, names);
    setNewPlayerNames((prev) => ({ ...prev, [teamId]: '' }));
  };

  return (
    <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '12px', padding: '16px' }}>
      <div className="scoreboard" style={{ color: '#C9A227', fontSize: '20px', marginBottom: '16px' }}>
        CATEGORY SETTINGS &amp; TEAMS
      </div>

      {/* Teams & Squad Management */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#F4F2EA', marginBottom: '10px' }}>
          Teams ({cat.teams.length})
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          {cat.teams.map((t) => {
            const isOpen = !!openTeamIds[t.id];
            return (
              <div
                key={t.id}
                style={{
                  background: '#082820',
                  border: '1px solid #1E4636',
                  borderRadius: '8px',
                  padding: '10px 14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '5px', background: t.color }} />
                    <span style={{ fontWeight: 700, color: '#F4F2EA', fontSize: '13.5px' }}>{t.name}</span>
                    <span style={{ fontSize: '11px', color: '#8FA89B' }}>
                      ({t.players.filter((p) => !p.unknown).length} players)
                    </span>
                  </div>
                  <button
                    onClick={() => toggleTeam(t.id)}
                    style={{ background: 'none', border: 'none', color: '#6E9080', fontSize: '12px', cursor: 'pointer' }}
                  >
                    {isOpen ? 'Close roster ▲' : 'Manage roster ▾'}
                  </button>
                </div>

                {isOpen && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #16352A' }}>
                    {/* Players list */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                      {t.players
                        .filter((p) => !p.unknown)
                        .map((p) => (
                          <span
                            key={p.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: '#16352A',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontSize: '11.5px',
                              color: '#DDE6DF',
                            }}
                          >
                            <span>{p.name} {p.position ? `(${p.position})` : ''}</span>
                            <span
                              onClick={() => onRemovePlayer(t.id, p.id)}
                              style={{ cursor: 'pointer', color: '#8FA89B', fontWeight: 700 }}
                            >
                              ✕
                            </span>
                          </span>
                        ))}
                    </div>

                    {/* Add Player Input */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        className="form-input"
                        placeholder="Player name (or comma-separated: John, Peter, David)"
                        value={newPlayerNames[t.id] || ''}
                        onChange={(e) => setNewPlayerNames({ ...newPlayerNames, [t.id]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddPlayer(t.id);
                        }}
                      />
                      <button
                        className="stat-btn"
                        style={{ background: '#C9A227', color: '#16201B', fontWeight: 700, padding: '0 14px' }}
                        onClick={() => handleAddPlayer(t.id)}
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Team form */}
        <form onSubmit={handleAddTeam} style={{ display: 'flex', gap: '8px' }}>
          <input
            className="form-input"
            placeholder="New team name…"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
          />
          <button
            type="submit"
            className="stat-btn"
            style={{ background: '#C9A227', color: '#16201B', fontWeight: 700, padding: '0 16px' }}
          >
            + Add Team
          </button>
        </form>
      </div>

      {/* Referees Management */}
      <div style={{ marginBottom: '24px', borderTop: '1px solid #16352A', paddingTop: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#F4F2EA', marginBottom: '8px' }}>
          Match Officials / Referees ({cat.referees?.length || 0})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {(cat.referees || []).map((r, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#16352A',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#DDE6DF',
              }}
            >
              <span>🧑‍⚖️ {r}</span>
              <span
                onClick={() => onRemoveReferee(r)}
                style={{ cursor: 'pointer', color: '#8FA89B', fontWeight: 700 }}
              >
                ✕
              </span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="form-input"
            placeholder="Referee name…"
            value={newRefName}
            onChange={(e) => setNewRefName(e.target.value)}
          />
          <button
            className="stat-btn"
            style={{ background: '#C9A227', color: '#16201B', fontWeight: 700, padding: '0 14px' }}
            onClick={() => {
              if (newRefName.trim()) {
                onAddReferee(newRefName.trim());
                setNewRefName('');
              }
            }}
          >
            + Add Ref
          </button>
        </div>
      </div>

      {/* Database Quick Actions */}
      <div style={{ borderTop: '1px solid #16352A', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#F4F2EA' }}>
          Tournament Actions
        </div>
        <div>
          <button
            className="stat-btn"
            onClick={onResetRealSeason}
            style={{ background: '#163E31', color: '#DDE6DF', border: '1px solid #2B5746', padding: '8px 14px' }}
          >
            🔄 Restore 2026 Ruiru Titans Real Season Data
          </button>
        </div>

        {/* Delete Category */}
        <div style={{ marginTop: '12px' }}>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ background: 'none', border: 'none', color: '#E24A3B', fontSize: '12px', cursor: 'pointer' }}
            >
              Delete this category ({cat.label})
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#E24A3B' }}>Are you sure?</span>
              <button
                className="stat-btn"
                style={{ background: '#E24A3B', color: '#FFF' }}
                onClick={() => onDeleteCategory(activeCategoryKey)}
              >
                Yes, Delete
              </button>
              <button
                className="stat-btn"
                style={{ background: '#2B4E40', color: '#FFF' }}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

