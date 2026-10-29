import React, { useState, useEffect } from 'react';

function LeaderboardCard({ title, list, countKey }) {
  return (
    <div
      style={{
        background: '#121212',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '14px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
      }}
    >
      <div
        className="scoreboard"
        style={{
          color: '#FF9500',
          fontSize: '18px',
          letterSpacing: '0.05em',
          marginBottom: '12px',
        }}
      >
        {title.toUpperCase()}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {(list || []).map((p, i) => {
          const rawFirst = (p.firstName || p.first_name || '').trim();
          const rawUser = (p.username || '').trim();
          const firstName = (rawFirst && rawFirst.toLowerCase() !== 'unrecorded') ? rawFirst : '';
          // Stats should show first name when available; if not, show username
          const displayName = p.displayName || firstName || rawUser || p.name || p.id;
          const tooltip = p.fullName && p.fullName !== displayName ? `${p.fullName} (@${rawUser || p.username || ''})` : displayName;

          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '8px',
                background: i === 0 ? 'rgba(255, 149, 0, 0.12)' : '#1C1C1E',
                border: i === 0 ? '1px solid rgba(255, 149, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#8E8E93', width: '16px', textAlign: 'right', fontWeight: 700 }}>
                  {i + 1}
                </span>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: p.teamColor || '#FF9500',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }} title={tooltip}>{displayName}</span>
                {p.position && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      background: 'rgba(255, 149, 0, 0.15)',
                      color: '#FF9F0A',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 149, 0, 0.3)',
                    }}
                  >
                    {p.position}
                  </span>
                )}
                <span style={{ fontSize: '11.5px', color: '#8E8E93' }}>({p.teamName})</span>
              </div>
              <div
                className="scoreboard"
                style={{ fontSize: '20px', color: '#FF9500', fontWeight: 800 }}
              >
                {p[countKey]}
              </div>
            </div>
          );
        })}

        {(!list || list.length === 0) && (
          <div style={{ fontSize: '12px', color: '#8E8E93', textAlign: 'center', padding: '16px 0' }}>
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
  const categoryEntries = Object.entries(categories).filter(([k, c]) => {
    if (c.isDeleted) return false;
    const fixCount = (c.fixtures || []).length + Object.values(c.groupFixtures || {}).flat().length;
    const playerCount = (c.teams || []).reduce((acc, t) => acc + (t.players || []).length, 0);
    return fixCount > 0 || playerCount > 0;
  });

  // Default to the current active league/category instead of 'all'
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(() => {
    if (activeCategoryKey && categories[activeCategoryKey] && !categories[activeCategoryKey].isDeleted) {
      return activeCategoryKey;
    }
    return categoryEntries.length > 0 ? categoryEntries[0][0] : 'all';
  });

  // Automatically sync whenever activeCategoryKey updates
  useEffect(() => {
    if (activeCategoryKey && categories[activeCategoryKey] && !categories[activeCategoryKey].isDeleted) {
      setSelectedCategoryFilter(activeCategoryKey);
    }
  }, [activeCategoryKey, categories]);

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
          borderRadius: '16px',
          padding: '16px 18px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            📊 OFFICIAL PLAYER STATISTICS BY CATEGORY
          </div>
          <h2 className="scoreboard" style={{ margin: '2px 0 0', fontSize: '26px', color: '#FFFFFF', letterSpacing: '0.04em' }}>
            PLAYER STATS · {categories[selectedCategoryFilter]?.label?.toUpperCase() || 'CURRENT LEAGUE'}
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {categoryEntries.map(([catKey, catObj]) => {
            const isSelected = selectedCategoryFilter === catKey;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategoryFilter(catKey)}
                style={{
                  background: isSelected ? '#FF9500' : '#1C1C1E',
                  color: isSelected ? '#000000' : '#FFFFFF',
                  border: isSelected ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '999px',
                  padding: '7px 16px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  minHeight: '40px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{catObj.mode === 'cup' ? '🏆' : '⚽'}</span>
                <span>{catObj.label}</span>
                {catKey === activeCategoryKey && (
                  <span
                    style={{
                      fontSize: '9.5px',
                      background: isSelected ? '#000000' : 'rgba(255, 149, 0, 0.2)',
                      color: isSelected ? '#FF9500' : '#FF9F0A',
                      padding: '2px 6px',
                      borderRadius: '999px',
                      fontWeight: 900,
                    }}
                  >
                    Current
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSelectedCategoryFilter('all')}
            style={{
              background: selectedCategoryFilter === 'all' ? '#FF9500' : '#1C1C1E',
              color: selectedCategoryFilter === 'all' ? '#000000' : '#8E8E93',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '999px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: '40px',
            }}
          >
            📚 All Categories ({categoryEntries.length})
          </button>
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
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '20px',
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
                    background: catObj.mode === 'cup' ? 'rgba(255, 149, 0, 0.18)' : 'rgba(48, 209, 88, 0.15)',
                    border: `1px solid ${catObj.mode === 'cup' ? '#FF9500' : '#30D158'}`,
                    color: catObj.mode === 'cup' ? '#FF9500' : '#30D158',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {catObj.mode === 'cup' ? '🏆 Cup Category' : '📊 League Category'}
                </span>
                <h3 className="scoreboard" style={{ margin: 0, fontSize: '24px', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
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
