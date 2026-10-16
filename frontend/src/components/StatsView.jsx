import React from 'react';

function LeaderboardCard({ title, list, countKey, activeCategoryKey }) {
  return (
    <div
      style={{
        background: '#0F2E24',
        border: '1px solid #1E4636',
        borderRadius: '12px',
        padding: '14px',
        marginBottom: '16px',
      }}
    >
      <div
        className="scoreboard"
        style={{
          color: '#C9A227',
          fontSize: '18px',
          letterSpacing: '0.06em',
          marginBottom: '10px',
        }}
      >
        {title.toUpperCase()}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {(list || []).map((p, i) => (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderRadius: '6px',
              background: i === 0 ? 'rgba(201,162,39,0.08)' : '#0B231B',
              fontSize: '12.5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#6E9080', width: '14px', textAlign: 'right' }}>
                {i + 1}
              </span>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: p.teamColor,
                  display: 'inline-block',
                }}
              />
              <span style={{ fontWeight: 600, color: '#F4F2EA' }}>{p.name}</span>
              <span style={{ fontSize: '11px', color: '#8FA89B' }}>({p.teamName})</span>
            </div>
            <div
              className="scoreboard"
              style={{ fontSize: '18px', color: '#C9A227', fontWeight: 700 }}
            >
              {p[countKey]}
            </div>
          </div>
        ))}

        {(!list || list.length === 0) && (
          <div style={{ fontSize: '11.5px', color: '#6E9080', textAlign: 'center', padding: '12px 0' }}>
            No records logged yet.
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatsView({ leaderboards, activeCategoryKey }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
        <a
          href={`/api/categories/${activeCategoryKey}/export/players-csv/`}
          className="csv-export-btn"
          title="Download player goals, assists, and disciplinary stats as CSV"
        >
          📥 Export Player Stats CSV
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        <LeaderboardCard
          title="Top Scorers (Golden Boot)"
          list={leaderboards?.scorers}
          countKey="goal"
          activeCategoryKey={activeCategoryKey}
        />
        <LeaderboardCard
          title="Top Assists (Playmaker)"
          list={leaderboards?.assists}
          countKey="assist"
          activeCategoryKey={activeCategoryKey}
        />
        <LeaderboardCard
          title="Yellow Cards (Discipline)"
          list={leaderboards?.yellows}
          countKey="yellow"
          activeCategoryKey={activeCategoryKey}
        />
        <LeaderboardCard
          title="Red Cards (Expulsions)"
          list={leaderboards?.reds}
          countKey="red"
          activeCategoryKey={activeCategoryKey}
        />
      </div>
    </div>
  );
}

