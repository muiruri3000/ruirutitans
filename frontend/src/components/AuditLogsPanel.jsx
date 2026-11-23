import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const EVENT_TYPE_TABS = [
  { key: 'all', label: 'All Events' },
  { key: 'auth', label: '🔑 Logins & Auth' },
  { key: 'matches', label: '⚽ Matches & State' },
  { key: 'players', label: '🏃 Players' },
  { key: 'transfers_bans', label: '🔄 Transfers & Bans' },
  { key: 'users', label: '👥 Users & Security' },
  { key: 'duty_voting', label: '🧹 Duty & Voting' },
  { key: 'content', label: '🖼️ Homepage & Media' },
];

const EVENT_BADGE_MAP = {
  login: { label: 'LOGIN', bg: 'rgba(108, 229, 160, 0.16)', color: '#6CE5A0', border: '#2F7D5C' },
  login_failed: { label: 'FAILED LOGIN', bg: 'rgba(239, 68, 68, 0.18)', color: '#FCA5A5', border: '#EF4444' },
  logout: { label: 'LOGOUT', bg: 'rgba(148, 163, 184, 0.16)', color: '#CBD5E1', border: '#475569' },
  password_change: { label: 'PASSWORD', bg: 'rgba(245, 158, 11, 0.16)', color: '#FBBF24', border: '#D97706' },
  user_management: { label: 'USER MGMT', bg: 'rgba(168, 85, 247, 0.16)', color: '#D8B4FE', border: '#9333EA' },
  player_management: { label: 'PLAYER MGMT', bg: 'rgba(56, 189, 248, 0.16)', color: '#7DD3FC', border: '#0284C7' },
  match_update: { label: 'MATCH UPDATE', bg: 'rgba(255, 149, 0, 0.18)', color: '#FFB340', border: '#FF9500' },
  state_update: { label: 'STATE SYNC', bg: 'rgba(245, 158, 11, 0.14)', color: '#FCD34D', border: '#B45309' },
  category_management: { label: 'COMPETITION', bg: 'rgba(251, 146, 60, 0.16)', color: '#FDBA74', border: '#EA580C' },
  transfer: { label: 'TRANSFER', bg: 'rgba(34, 197, 94, 0.16)', color: '#86EFAC', border: '#16A34A' },
  ban: { label: 'DISCIPLINARY BAN', bg: 'rgba(239, 68, 68, 0.18)', color: '#FCA5A5', border: '#DC2626' },
  duty_roster: { label: 'DUTY ROSTER', bg: 'rgba(45, 212, 191, 0.16)', color: '#5EEAD4', border: '#0D9488' },
  voting: { label: 'VOTING / MVP', bg: 'rgba(250, 204, 21, 0.16)', color: '#FDE047', border: '#CA8A04' },
  homepage: { label: 'HOMEPAGE', bg: 'rgba(99, 102, 241, 0.18)', color: '#A5B4FC', border: '#4F46E5' },
  content: { label: 'MEDIA / CONTENT', bg: 'rgba(236, 72, 153, 0.16)', color: '#F9A8D4', border: '#DB2777' },
};

function formatAuditTimestamp(iso) {
  if (!iso) return { exact: '—', relative: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { exact: iso, relative: '' };

  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  let relative = '';
  if (diffSec < 60) relative = 'Just now';
  else if (diffSec < 3600) relative = `${Math.floor(diffSec / 60)}m ago`;
  else if (diffSec < 86400) relative = `${Math.floor(diffSec / 3600)}h ago`;
  else relative = `${Math.floor(diffSec / 86400)}d ago`;

  const exact = d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return { exact, relative };
}

function formatRoleBadge(role, actorType) {
  if (actorType === 'player' || role === 'player') {
    return { label: 'Player', bg: 'rgba(56, 189, 248, 0.15)', color: '#7DD3FC', border: '#0284C7' };
  }
  if (role === 'superadmin') {
    return { label: 'Superadmin', bg: 'rgba(255, 149, 0, 0.18)', color: '#FFB340', border: '#FF9500' };
  }
  if (actorType === 'cms') {
    return {
      label: (role || 'Admin').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      bg: 'rgba(108, 229, 160, 0.14)',
      color: '#6CE5A0',
      border: '#2F7D5C',
    };
  }
  return { label: role || actorType || 'User', bg: '#1C1C1E', color: '#AEAEB2', border: 'rgba(255,255,255,0.15)' };
}

export default function AuditLogsPanel({ categories = {} }) {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({
    total_count: 0,
    logins_count: 0,
    failed_logins_count: 0,
    activities_count: 0,
    unique_actors_count: 0,
  });
  const [actors, setActors] = useState([]);
  const [filteredCount, setFilteredCount] = useState(0);

  const [eventType, setEventType] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [actorTypeFilter, setActorTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAuditLogs({
        event_type: eventType,
        actor: actorFilter,
        actor_type: actorTypeFilter,
        category: categoryFilter,
        q: searchQuery,
        limit: 200,
      });
      setLogs(data.logs || []);
      setFilteredCount(data.filtered_count ?? (data.logs || []).length);
      if (data.summary) setSummary(data.summary);
      if (Array.isArray(data.actors)) setActors(data.actors);
    } catch (err) {
      setError(err.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [eventType, actorFilter, actorTypeFilter, categoryFilter, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadLogs();
    }, searchQuery ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadLogs, searchQuery]);

  return (
    <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="scoreboard" style={{ color: '#FF9500', fontSize: '20px' }}>
            🛡️ SYSTEM AUDIT &amp; ACTIVITY LOGS
          </div>
          <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}>
            Complete audit trail of CMS manager &amp; player logins, failed login attempts, and every activity performed across the platform.
          </div>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          disabled={loading}
          className="stat-btn"
          style={{
            background: '#1C1C1E',
            color: '#FF9500',
            border: '1px solid #FF9500',
            padding: '8px 14px',
            borderRadius: '8px',
            fontWeight: 800,
            fontSize: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Refreshing…' : '🔄 Refresh Logs'}
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
        <div style={{ background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>Total Entries</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#FFFFFF', marginTop: '2px' }}>{summary.total_count}</div>
        </div>
        <div style={{ background: '#1C1C1E', border: '1px solid rgba(108,229,160,0.28)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: '#6CE5A0', fontWeight: 700, textTransform: 'uppercase' }}>Successful Logins</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#6CE5A0', marginTop: '2px' }}>{summary.logins_count}</div>
        </div>
        <div style={{ background: '#1C1C1E', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: '#FCA5A5', fontWeight: 700, textTransform: 'uppercase' }}>Failed Logins</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#FCA5A5', marginTop: '2px' }}>{summary.failed_logins_count}</div>
        </div>
        <div style={{ background: '#1C1C1E', border: '1px solid rgba(255,149,0,0.28)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: '#FFB340', fontWeight: 700, textTransform: 'uppercase' }}>Activities Logged</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#FFB340', marginTop: '2px' }}>{summary.activities_count}</div>
        </div>
        <div style={{ background: '#1C1C1E', border: '1px solid rgba(56,189,248,0.28)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: '#7DD3FC', fontWeight: 700, textTransform: 'uppercase' }}>Active People</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#7DD3FC', marginTop: '2px' }}>{summary.unique_actors_count}</div>
        </div>
      </div>

      {/* Event Type Filter Pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {EVENT_TYPE_TABS.map((tab) => {
          const active = eventType === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setEventType(tab.key)}
              style={{
                background: active ? '#FF9500' : '#1C1C1E',
                color: active ? '#16201B' : '#EBEBF5',
                border: active ? '1px solid #FF9500' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: '999px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filters Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', background: '#1C1C1E', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <label style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
            By Person / Actor
          </label>
          <select
            className="form-input"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            style={{ width: '100%', fontSize: '12px', padding: '7px 10px' }}
          >
            <option value="all">All People ({actors.length})</option>
            {actors.map((a, idx) => (
              <option key={`${a.username || a.name}-${idx}`} value={a.username || a.name}>
                {a.name}{a.username ? ` (@${a.username})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
            Account Type
          </label>
          <select
            className="form-input"
            value={actorTypeFilter}
            onChange={(e) => setActorTypeFilter(e.target.value)}
            style={{ width: '100%', fontSize: '12px', padding: '7px 10px' }}
          >
            <option value="all">All Accounts</option>
            <option value="cms">CMS Staff / Admins</option>
            <option value="player">Players</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
            Competition
          </label>
          <select
            className="form-input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ width: '100%', fontSize: '12px', padding: '7px 10px' }}
          >
            <option value="all">All Competitions</option>
            {Object.entries(categories || {}).map(([k, c]) => (
              <option key={k} value={k}>
                {c?.label || k}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
            Search Activity, Person, City or IP
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. login, Nairobi, Kenya, Brayo, admin..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', fontSize: '12px', padding: '7px 10px' }}
          />
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.14)', border: '1px solid #EF4444', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#FCA5A5', fontWeight: 700 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Results Count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: '#8E8E93' }}>
        <span>
          Showing <strong style={{ color: '#FFFFFF' }}>{logs.length}</strong> of{' '}
          <strong style={{ color: '#FFFFFF' }}>{filteredCount}</strong> matching audit entries
        </span>
        {(eventType !== 'all' || actorFilter !== 'all' || actorTypeFilter !== 'all' || categoryFilter !== 'all' || searchQuery) && (
          <button
            type="button"
            onClick={() => {
              setEventType('all');
              setActorFilter('all');
              setActorTypeFilter('all');
              setCategoryFilter('all');
              setSearchQuery('');
            }}
            style={{ background: 'none', border: 'none', color: '#FF9500', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer' }}
          >
            Clear All Filters ✕
          </button>
        )}
      </div>

      {/* Audit Entries Table */}
      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: '#161618' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#1C1C1E', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: '#8E8E93', fontSize: '11px', textTransform: 'uppercase' }}>
              <th style={{ padding: '10px 12px', whiteSpace: 'nowrap', width: '110px' }}>When</th>
              <th style={{ padding: '10px 12px', width: '160px' }}>Person (By Whom)</th>
              <th style={{ padding: '10px 12px', whiteSpace: 'nowrap', width: '90px' }}>Event</th>
              <th style={{ padding: '10px 12px', maxWidth: '280px' }}>Activity &amp; Target</th>
              <th style={{ padding: '10px 12px', whiteSpace: 'nowrap', minWidth: '150px' }}>Location &amp; Coordinates</th>
              <th style={{ padding: '10px 12px', whiteSpace: 'nowrap', width: '120px' }}>IP / Source</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '28px 16px', textAlign: 'center', color: '#8E8E93' }}>
                  {loading ? 'Loading audit logs…' : 'No audit log entries match your filters yet.'}
                </td>
              </tr>
            ) : (
              logs.map((entry) => {
                const badge = EVENT_BADGE_MAP[entry.event_type] || {
                  label: String(entry.event_type || 'ACTIVITY').toUpperCase(),
                  bg: 'rgba(255, 255, 255, 0.08)',
                  color: '#EBEBF5',
                  border: 'rgba(255, 255, 255, 0.16)',
                };
                const roleBadge = formatRoleBadge(entry.actor_role, entry.actor_type);
                const ts = formatAuditTimestamp(entry.created_at);
                const detailPairs = entry.details && typeof entry.details === 'object'
                  ? Object.entries(entry.details).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
                  : [];

                return (
                  <tr
                    key={entry.id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' }}
                  >
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ color: '#FFFFFF', fontWeight: 700 }}>{ts.relative || ts.exact}</div>
                      <div style={{ color: '#8E8E93', fontSize: '10.5px', marginTop: '2px' }}>{ts.exact}</div>
                    </td>

                    <td style={{ padding: '10px 12px', minWidth: '170px' }}>
                      <div style={{ color: '#FFFFFF', fontWeight: 800 }}>
                        {entry.actor_name || entry.actor_username || 'Unknown'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {entry.actor_username && (
                          <span style={{ color: '#8E8E93', fontSize: '11px', fontFamily: 'monospace' }}>
                            @{entry.actor_username}
                          </span>
                        )}
                        <span
                          style={{
                            background: roleBadge.bg,
                            color: roleBadge.color,
                            border: `1px solid ${roleBadge.border}`,
                            borderRadius: '999px',
                            padding: '1px 7px',
                            fontSize: '10px',
                            fontWeight: 800,
                          }}
                        >
                          {roleBadge.label}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>

                    <td style={{ padding: '8px 10px', maxWidth: '280px' }}>
                      <div style={{ color: '#FFFFFF', fontWeight: 700, lineHeight: 1.35, fontSize: '11.5px', wordBreak: 'break-word' }}>
                        {entry.action}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {entry.target && !entry.action.toLowerCase().includes(entry.target.toLowerCase()) && (
                          <span style={{ background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', color: '#D1D1D6' }}>
                            {entry.target}
                          </span>
                        )}
                        {entry.category_key && (
                          <span style={{ background: 'rgba(255, 149, 0, 0.1)', border: '1px solid rgba(255, 149, 0, 0.25)', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', color: '#FFB340' }}>
                            {categories?.[entry.category_key]?.label ? categories[entry.category_key].label.split('—')[0].trim() : entry.category_key}
                          </span>
                        )}
                        {detailPairs.slice(0, 2).map(([dk, dv]) => (
                          <span
                            key={dk}
                            style={{ background: '#1C1C1E', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', color: '#8E8E93' }}
                          >
                            {dk}: {Array.isArray(dv) ? dv.join(', ') : typeof dv === 'object' ? JSON.stringify(dv) : String(dv)}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', minWidth: '150px' }}>
                      {entry.city || entry.country ? (
                        <div style={{ color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '13px' }}>📍</span>
                          <span>
                            {[entry.city, entry.country].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      ) : (
                        <div style={{ color: '#636366', fontSize: '11px' }}>—</div>
                      )}
                      {entry.coordinates ? (
                        <div style={{ marginTop: '4px' }}>
                          <a
                            href={`https://www.google.com/maps?q=${encodeURIComponent(entry.coordinates)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#FF9500',
                              fontSize: '10.5px',
                              fontFamily: 'monospace',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'rgba(255, 149, 0, 0.1)',
                              padding: '2px 7px',
                              borderRadius: '5px',
                              border: '1px solid rgba(255, 149, 0, 0.28)',
                            }}
                            title="View coordinates on Google Maps"
                          >
                            <span>🌐</span>
                            <span>{entry.coordinates}</span>
                          </a>
                        </div>
                      ) : null}
                    </td>

                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#8E8E93', fontSize: '11px', fontFamily: 'monospace' }}>
                      {entry.ip_address || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
