import React, { useState } from 'react';

function LeaderboardCard({ title, list, countKey }) {
  return (
    <div
      style={{
        background: '#121212',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '14px',
      }}
    >
      <div
        className="scoreboard"
        style={{
          color: '#FF9500',
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
              background: i === 0 ? 'rgba(255, 149, 0,0.1)' : '#000000',
              fontSize: '12.5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#8E8E93', width: '14px', textAlign: 'right' }}>
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
              <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{p.name}</span>
              {p.position && (
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 800,
                    background: '#13382B',
                    color: '#FF9500',
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}
                >
                  {p.position}
                </span>
              )}
              <span style={{ fontSize: '11px', color: '#8E8E93' }}>({p.teamName})</span>
            </div>
            <div
              className="scoreboard"
              style={{ fontSize: '18px', color: '#FF9500', fontWeight: 700 }}
            >
              {p[countKey]}
            </div>
          </div>
        ))}

        {(!list || list.length === 0) && (
          <div style={{ fontSize: '11.5px', color: '#8E8E93', textAlign: 'center', padding: '12px 0' }}>
            No records logged in this category yet.
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatsView({
  categories = {},
  leaderboardsByCategory = {},
  leaderboards,
  activeCategoryKey = 'ruiru-titans-league-oct-nov-2026',
}) {
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

  const categoryEntries = Object.entries(categories).filter(([k, c]) => {
    if (c.isDeleted) return false;
    const fixCount = (c.fixtures || []).length + Object.values(c.groupFixtures || {}).flat().length;
    const playerCount = (c.teams || []).reduce((acc, t) => acc + (t.players || []).length, 0);
    return fixCount > 0 || playerCount > 0;
  });
  // Fallback if categories prop wasn't passed
  if (categoryEntries.length === 0 && leaderboards) {
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          <LeaderboardCard title="Top Scorers (Golden Boot)" list={leaderboards?.scorers} countKey="goal" />
          <LeaderboardCard title="Top Assists (Playmaker)" list={leaderboards?.assists} countKey="assist" />
          <LeaderboardCard title="Yellow Cards (Discipline)" list={leaderboards?.yellows} countKey="yellow" />
          <LeaderboardCard title="Red Cards (Expulsions)" list={leaderboards?.reds} countKey="red" />
        </div>
      </div>
    );
  }

  const visibleCategories =
    selectedCategoryFilter === 'all'
      ? categoryEntries
      : categoryEntries.filter(([k]) => k === selectedCategoryFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Top Filter Bar for Category-Grouped Player Stats */}
      <div
        style={{
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '14px',
          padding: '16px 18px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            📊 OFFICIAL PLAYER STATISTICS BY CATEGORY
          </div>
          <h2 className="scoreboard" style={{ margin: '2px 0 0', fontSize: '26px', color: '#FFFFFF', letterSpacing: '0.04em' }}>
            PLAYER STATS GROUPED BY COMPETITION CATEGORY
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter('all')}
            style={{
              background: selectedCategoryFilter === 'all' ? '#FF9500' : '#121212',
              color: selectedCategoryFilter === 'all' ? '#16201B' : '#EBEBF5',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '999px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            📚 All Categories ({categoryEntries.length})
          </button>
          {categoryEntries.map(([catKey, catObj]) => (
            <button
              key={catKey}
              type="button"
              onClick={() => setSelectedCategoryFilter(catKey)}
              style={{
                background: selectedCategoryFilter === catKey ? '#FF9500' : '#121212',
                color: selectedCategoryFilter === catKey ? '#16201B' : '#EBEBF5',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '999px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {catObj.mode === 'cup' ? '🏆' : '⚽'} {catObj.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Groups */}
      {visibleCategories.map(([catKey, catObj]) => {
        const catStats = leaderboardsByCategory[catKey] || {
          scorers: [],
          assists: [],
          yellows: [],
          reds: [],
          totals: { goals: 0, assists: 0, yellows: 0, reds: 0 },
        };
        const teamCount = (catObj.teams || []).length;
        const playerCount = (catObj.teams || []).reduce(
          (sum, t) => sum + (t.players || []).filter((p) => !p.unknown).length,
          0
        );

        return (
          <section
            key={catKey}
            style={{
              background: '#121212',
              border: '1px solid #23503F',
              borderRadius: '16px',
              padding: '18px',
              boxShadow: '0 10px 26px rgba(0, 0, 0, 0.22)',
            }}
          >
            {/* Category Group Header */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                paddingBottom: '14px',
                marginBottom: '16px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    background: catObj.mode === 'cup' ? 'rgba(255, 149, 0, 0.2)' : 'rgba(92, 214, 133, 0.16)',
                    border: `1px solid ${catObj.mode === 'cup' ? '#FF9500' : '#5CD685'}`,
                    color: catObj.mode === 'cup' ? '#FF9500' : '#5CD685',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {catObj.mode === 'cup' ? '🏆 Cup Category' : '📊 League Category'}
                </span>
                <h3 className="scoreboard" style={{ margin: 0, fontSize: '24px', color: '#FFFFFF', letterSpacing: '0.04em' }}>
                  {catObj.label}
                </h3>
                <span style={{ fontSize: '12px', color: '#8E8E93' }}>
                  • {teamCount} Teams · {playerCount} Registered Players · {catStats.totals?.goals || 0} Goals Logged
                </span>
              </div>

              <a
                href={`/api/categories/${catKey}/export/players-csv/`}
                className="csv-export-btn"
                title={`Download ${catObj.label} player stats as CSV`}
              >
                📥 Export {catObj.label} CSV
              </a>
            </div>

            {/* 4 Leaderboards for this Category */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))', gap: '14px' }}>
              <LeaderboardCard
                title="Top Scorers (Golden Boot)"
                list={catStats.scorers}
                countKey="goal"
              />
              <LeaderboardCard
                title="Top Assists (Playmaker)"
                list={catStats.assists}
                countKey="assist"
              />
              <LeaderboardCard
                title="Yellow Cards (Discipline)"
                list={catStats.yellows}
                countKey="yellow"
              />
              <LeaderboardCard
                title="Red Cards (Expulsions)"
                list={catStats.reds}
                countKey="red"
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
