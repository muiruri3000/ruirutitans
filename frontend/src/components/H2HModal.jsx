import React, { useEffect } from 'react';

export default function H2HModal({ data, loading, error, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="h2h-overlay"
      onClick={(e) => {
        if (e.target.className === 'h2h-overlay') onClose();
      }}
    >
      <div className="h2h-modal">
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '12px',
            marginBottom: '16px',
          }}
        >
          <div>
            <div
              style={{
                color: '#FF9500',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
              }}
            >
              MATCH PREVIEW
            </div>
            <h2
              className="scoreboard"
              style={{ margin: '2px 0 0', fontSize: '24px', color: '#FFFFFF' }}
            >
              HEAD-TO-HEAD &amp; RECENT FORM
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8E8E93',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8E8E93' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>⚔️</div>
            <div style={{ fontSize: '13px' }}>Analyzing clash history and form statistics…</div>
          </div>
        ) : error || !data ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#EF4444' }}>
            {error || 'Failed to load comparison.'}
          </div>
        ) : (
          <div>
            {/* Clash Banner */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '16px 20px',
                marginBottom: '18px',
              }}
            >
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: data.team1.color,
                    margin: '0 auto 6px',
                  }}
                />
                <div className="scoreboard" style={{ fontSize: '22px', color: '#FFFFFF' }}>
                  {data.team1.name}
                </div>
                <div style={{ fontSize: '11.5px', color: '#8E8E93' }}>
                  {data.team1.points} pts · W{data.team1.won} D{data.team1.drawn} L{data.team1.lost}
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '0 16px' }}>
                <div className="scoreboard" style={{ fontSize: '28px', color: '#FF9500', lineHeight: 1 }}>
                  {data.h2h_summary.team1_wins} - {data.h2h_summary.draws} - {data.h2h_summary.team2_wins}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#8E8E93',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginTop: '4px',
                  }}
                >
                  {data.h2h_summary.total_matches} previous match
                  {data.h2h_summary.total_matches === 1 ? '' : 'es'}
                </div>
              </div>

              <div style={{ textAlign: 'center', flex: 1 }}>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: data.team2.color,
                    margin: '0 auto 6px',
                  }}
                />
                <div className="scoreboard" style={{ fontSize: '22px', color: '#FFFFFF' }}>
                  {data.team2.name}
                </div>
                <div style={{ fontSize: '11.5px', color: '#8E8E93' }}>
                  {data.team2.points} pts · W{data.team2.won} D{data.team2.drawn} L{data.team2.lost}
                </div>
              </div>
            </div>

            {/* Form Ribbons */}
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '18px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#FF9500',
                  marginBottom: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Recent Form (Last 5 Matches)
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid #1C1C1E',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#EBEBF5' }}>
                  {data.team1.name}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {data.team1_form && data.team1_form.length > 0 ? (
                    data.team1_form.map((m, i) => (
                      <span
                        key={i}
                        className={`form-badge ${m.result}`}
                        title={`${m.date}: vs ${m.opponent_name} (${m.score})`}
                      >
                        {m.result}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '11px', color: '#8E8E93' }}>No matches yet</span>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#EBEBF5' }}>
                  {data.team2.name}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {data.team2_form && data.team2_form.length > 0 ? (
                    data.team2_form.map((m, i) => (
                      <span
                        key={i}
                        className={`form-badge ${m.result}`}
                        title={`${m.date}: vs ${m.opponent_name} (${m.score})`}
                      >
                        {m.result}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '11px', color: '#8E8E93' }}>No matches yet</span>
                  )}
                </div>
              </div>
            </div>

            {/* Side-by-side Comparative Metrics */}
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '18px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#FF9500',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Season Comparative Metrics
              </div>
              {[
                ['Goals Scored', data.team1.goals_for, data.team2.goals_for],
                ['Goals Conceded', data.team1.goals_against, data.team2.goals_against],
                ['Avg Goals / Match', data.team1.avg_goals, data.team2.avg_goals],
                ['Clean Sheets', data.team1.clean_sheets, data.team2.clean_sheets],
                ['Yellow Cards', data.team1.yellow_cards, data.team2.yellow_cards],
                ['Red Cards', data.team1.red_cards, data.team2.red_cards],
              ].map(([label, v1, v2], i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #1C1C1E',
                    fontSize: '12.5px',
                  }}
                >
                  <span style={{ fontWeight: '700', color: '#FFFFFF', width: '40px' }}>{v1}</span>
                  <span style={{ color: '#8E8E93', textAlign: 'center', flex: 1 }}>{label}</span>
                  <span style={{ fontWeight: '700', color: '#FFFFFF', width: '40px', textAlign: 'right' }}>
                    {v2}
                  </span>
                </div>
              ))}
            </div>

            {/* Past Encounters Log */}
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#FF9500',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Previous Meetings History
              </div>
              {data.past_matches && data.past_matches.length > 0 ? (
                data.past_matches.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderBottom: '1px solid #1C1C1E',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ color: '#8E8E93', width: '60px' }}>{m.date}</span>
                    <span
                      style={{
                        fontWeight: m.home_id === data.team1.id ? '700' : '400',
                        color: m.home_id === data.team1.id ? '#FF9500' : '#EBEBF5',
                      }}
                    >
                      {m.home_name}
                    </span>
                    <span
                      className="scoreboard"
                      style={{ fontSize: '16px', color: '#FFFFFF', padding: '0 8px' }}
                    >
                      {m.played ? `${m.home_score} – ${m.away_score}` : 'vs'}
                    </span>
                    <span
                      style={{
                        fontWeight: m.away_id === data.team1.id ? '700' : '400',
                        color: m.away_id === data.team1.id ? '#FF9500' : '#EBEBF5',
                      }}
                    >
                      {m.away_name}
                    </span>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    padding: '12px',
                    fontSize: '12px',
                    color: '#8E8E93',
                    textAlign: 'center',
                    fontStyle: 'italic',
                  }}
                >
                  No previous meetings between these two teams on record.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

