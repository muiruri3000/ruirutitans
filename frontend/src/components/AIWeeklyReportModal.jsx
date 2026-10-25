import React, { useState, useEffect } from 'react';

export default function AIWeeklyReportModal({
  categoryKey,
  categoryLabel,
  fixtures = [],
  teamsById = {},
  onClose,
}) {
  const [week, setWeek] = useState('1');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'daily' | 'tactical' | 'json'
  const [copied, setCopied] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Initial load
  useEffect(() => {
    generateReport(week);
  }, []);

  const generateReport = async (selectedWeek) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/categories/${categoryKey}/reports/ai-matchweek-pdf/?format=json${
        selectedWeek && selectedWeek !== 'all' ? `&week=${selectedWeek}` : ''
      }`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to generate report: HTTP ${res.status}`);
      }
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error('AI Report generation failed:', err);
      setError(err.message || 'Failed to generate AI weekly report.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySummary = () => {
    if (!reportData) return;
    const text = `RUIRU TITANS FC - MATCHWEEK ${reportData.week_number} AI REPORT\n` +
      `-----------------------------------------\n` +
      `${reportData.ai_analysis?.weekly_headline || 'Matchweek Summary'}\n\n` +
      `${reportData.ai_analysis?.weekly_editorial || ''}\n\n` +
      `Total Goals: ${reportData.total_goals} (${reportData.goals_per_game} per match)\n` +
      `Matchweek MVP: ${reportData.ai_analysis?.mvp_player || 'N/A'}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadJSON = () => {
    if (!reportData) return;
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ruiru_titans_${categoryKey}_week_${reportData.week_number || 1}_report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pdfUrl = `/api/categories/${categoryKey}/reports/ai-matchweek-pdf/?auto=1${
    week && week !== 'all' ? `&week=${week}` : ''
  }`;

  const analysis = reportData?.ai_analysis || reportData?.ai || {};

  const mvpDisplayName = analysis.mvp_of_the_week?.name
    ? `${analysis.mvp_of_the_week.name} (${analysis.mvp_of_the_week.team})`
    : (analysis.mvp_player || 'TBD');

  const mvpRationale = analysis.mvp_of_the_week?.rationale || analysis.mvp_blurb || '';
  const executiveText = analysis.weekly_summary || analysis.weekly_editorial || '';
  const titleRaceText = analysis.title_race_and_table_movement || analysis.title_race_impact || '';

  const dailyGroupsList = Array.isArray(reportData?.daily_groups)
    ? reportData.daily_groups
    : Object.entries(reportData?.daily_groups || {}).map(([dayLabel, matches]) => {
        const dayAnalysis = (analysis.daily_reports || []).find((r) => r.date === dayLabel) || {};
        const completed = (matches || []).filter((m) => m.played);
        const goals = completed.reduce((acc, m) => acc + (m.home_score || 0) + (m.away_score || 0), 0);
        return {
          date: dayLabel,
          day_label: dayLabel,
          matches: matches || [],
          match_count: (matches || []).length,
          goals_count: goals,
          daily_headline: dayAnalysis.headline || `${dayLabel}: Matchday Roundup`,
          daily_narrative: dayAnalysis.narrative || '',
          match_takeaways: dayAnalysis.match_takeaways || [],
        };
      });

  return (
    <div
      className="h2h-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target.className === 'h2h-overlay') onClose();
      }}
    >
      <div
        className="h2h-modal"
        style={{
          background: '#092119',
          border: '1px solid #1E4636',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '860px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 48px rgba(0,0,0,0.7)',
          color: '#F4F2EA',
          overflow: 'hidden',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #1E4636',
            background: 'linear-gradient(180deg, #10382B 0%, #092119 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>🤖</span>
            <div>
              <div
                style={{
                  color: '#C9A227',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                TITANS AI INTELLIGENCE PLATFORM
              </div>
              <h2
                className="scoreboard"
                style={{ margin: '2px 0 0', fontSize: '22px', color: '#F4F2EA' }}
              >
                AI MATCHWEEK REPORT GENERATOR
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8FA89B',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Generator Control Toolbar */}
        <div
          style={{
            padding: '12px 22px',
            background: '#061913',
            borderBottom: '1px solid #1E4636',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#C9A227' }}>
              Select Matchweek:
            </label>
            <select
              value={week}
              onChange={(e) => {
                setWeek(e.target.value);
                generateReport(e.target.value);
              }}
              style={{
                background: '#133A2D',
                border: '1px solid #C9A227',
                color: '#F4F2EA',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <option value="1">Matchweek 1 (Opening Week)</option>
              <option value="2">Matchweek 2</option>
              <option value="3">Matchweek 3</option>
              <option value="4">Matchweek 4</option>
              <option value="all">Full Competition Summary (All Weeks)</option>
            </select>

            <button
              type="button"
              onClick={() => generateReport(week)}
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg, #C9A227 0%, #A68218 100%)',
                border: 'none',
                color: '#16201B',
                borderRadius: '8px',
                padding: '7px 16px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: loading ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(201, 162, 39, 0.3)',
              }}
            >
              {loading ? '⚡ Analyzing Match Data...' : '✨ Re-Generate AI Report'}
            </button>
          </div>

          {/* Quick Sub-navigation tabs */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { key: 'summary', label: '⚡ Executive Summary' },
              { key: 'daily', label: '📅 Daily Dossiers' },
              { key: 'tactical', label: '🔍 Tactical Trends' },
              { key: 'json', label: '📦 Raw JSON' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background: activeTab === tab.key ? '#1E4636' : 'transparent',
                  border: activeTab === tab.key ? '1px solid #C9A227' : '1px solid transparent',
                  color: activeTab === tab.key ? '#FCD34D' : '#8FA89B',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#C9A227' }}>
              <div style={{ fontSize: '36px', marginBottom: '14px', animation: 'spin 2s linear infinite' }}>
                🤖
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#F4F2EA', marginBottom: '6px' }}>
                Synthesizing Tournament Analytics with AI
              </div>
              <div style={{ fontSize: '12px', color: '#8FA89B', maxWidth: '460px', margin: '0 auto' }}>
                Analyzing goals, assists, referee disciplinary decisions, admin game reports, and table standings to construct the weekly dossier…
              </div>
            </div>
          ) : error ? (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #EF4444',
                color: '#FCA5A5',
                padding: '16px',
                borderRadius: '10px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '6px' }}>⚠️ Analysis Error</div>
              <div style={{ fontSize: '12.5px' }}>{error}</div>
              <button
                type="button"
                onClick={() => generateReport(week)}
                style={{
                  marginTop: '12px',
                  background: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Retry Analysis
              </button>
            </div>
          ) : reportData ? (
            <div>
              {/* Metrics Grid Banner */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '10px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ background: '#061C14', border: '1px solid #1E4636', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#8FA89B', textTransform: 'uppercase', fontWeight: 800 }}>Total Matches</div>
                  <div className="scoreboard" style={{ fontSize: '24px', color: '#F4F2EA' }}>{reportData.total_fixtures || 0}</div>
                </div>

                <div style={{ background: '#061C14', border: '1px solid #1E4636', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#8FA89B', textTransform: 'uppercase', fontWeight: 800 }}>Completed</div>
                  <div className="scoreboard" style={{ fontSize: '24px', color: '#4ADE80' }}>{reportData.completed_fixtures || 0}</div>
                </div>

                <div style={{ background: '#061C14', border: '1px solid #1E4636', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#8FA89B', textTransform: 'uppercase', fontWeight: 800 }}>Goals Scored</div>
                  <div className="scoreboard" style={{ fontSize: '24px', color: '#FCD34D' }}>{reportData.total_goals || 0}</div>
                </div>

                <div style={{ background: '#061C14', border: '1px solid #1E4636', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#8FA89B', textTransform: 'uppercase', fontWeight: 800 }}>Goals / Game</div>
                  <div className="scoreboard" style={{ fontSize: '24px', color: '#C9A227' }}>{reportData.goals_per_game || '0.0'}</div>
                </div>

                <div style={{ background: '#061C14', border: '1px solid #C9A227', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#C9A227', textTransform: 'uppercase', fontWeight: 800 }}>Matchweek MVP</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#F4F2EA', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {mvpDisplayName}
                  </div>
                </div>
              </div>

              {/* TAB 1: EXECUTIVE SUMMARY */}
              {activeTab === 'summary' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Headline Banner */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, rgba(201,162,39,0.15) 0%, rgba(11,36,28,0.4) 100%)',
                      border: '1px solid #C9A227',
                      borderRadius: '12px',
                      padding: '16px 20px',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: '#FCD34D', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.08em' }}>
                      ⚡ AI EXECUTIVE HEADLINE
                    </div>
                    <h3 style={{ margin: '4px 0 8px', fontSize: '19px', fontWeight: 900, color: '#F4F2EA' }}>
                      {analysis.weekly_headline || `Matchweek ${reportData.week_number} Review`}
                    </h3>
                    <p style={{ margin: 0, fontSize: '13.5px', lineHeight: '1.7', color: '#E2E8F0', whiteSpace: 'pre-line' }}>
                      {executiveText || 'No editorial generated yet.'}
                    </p>
                  </div>

                  {/* MVP Spotlight Banner */}
                  {mvpDisplayName && mvpDisplayName !== 'TBD' && (
                    <div
                      style={{
                        background: '#061C14',
                        border: '1px solid #1E4636',
                        borderLeft: '4px solid #C9A227',
                        borderRadius: '10px',
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '10.5px', color: '#C9A227', textTransform: 'uppercase', fontWeight: 800 }}>
                          🌟 OFFICIAL STAR PERFORMER &amp; MVP
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#F4F2EA', margin: '2px 0 4px' }}>
                          {mvpDisplayName}
                        </div>
                        <div style={{ fontSize: '12px', color: '#8FA89B' }}>
                          {mvpRationale || 'Delivered standout attacking leadership and game-winning influence.'}
                        </div>
                      </div>
                      <span
                        style={{
                          background: '#C9A227',
                          color: '#16201B',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ⭐ MATCHWEEK MVP
                      </span>
                    </div>
                  )}

                  {/* Title Race & Standings Movement */}
                  {titleRaceText && (
                    <div style={{ background: '#061C14', border: '1px solid #1E4636', borderRadius: '10px', padding: '14px 18px' }}>
                      <div style={{ fontSize: '11px', color: '#4ADE80', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' }}>
                        📊 Title Race &amp; Table Trajectory
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#D1D5DB', lineHeight: '1.6' }}>
                        {titleRaceText}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: DAILY DOSSIERS */}
              {activeTab === 'daily' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {dailyGroupsList.map((dayGroup, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#061C14',
                        border: '1px solid #1E4636',
                        borderRadius: '10px',
                        padding: '14px 18px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span
                          style={{
                            background: '#163E30',
                            color: '#6CE5A0',
                            border: '1px solid #2B6B50',
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                          }}
                        >
                          📅 {dayGroup.day_label || dayGroup.date}
                        </span>
                        <span style={{ fontSize: '11px', color: '#8FA89B' }}>
                          {dayGroup.match_count} match{dayGroup.match_count > 1 ? 'es' : ''} · {dayGroup.goals_count} goals
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#F4F2EA', marginBottom: '8px' }}>
                        {dayGroup.daily_headline}
                      </div>

                      <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '10px', lineHeight: '1.5' }}>
                        {dayGroup.daily_narrative}
                      </div>

                      {/* Matches in this day */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {(dayGroup.matches || []).map((m, mIdx) => (
                          <div
                            key={mIdx}
                            style={{
                              background: '#0B281F',
                              border: '1px solid #1B4536',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div style={{ flex: 1, fontSize: '12.5px', fontWeight: 700 }}>
                              {m.home_team?.name}
                            </div>
                            <div
                              className="scoreboard"
                              style={{
                                fontSize: '16px',
                                color: m.played ? '#FCD34D' : '#8FA89B',
                                background: '#051811',
                                padding: '2px 10px',
                                borderRadius: '4px',
                                border: '1px solid #1E4636',
                              }}
                            >
                              {m.played ? `${m.home_score} - ${m.away_score}` : 'VS'}
                            </div>
                            <div style={{ flex: 1, textAlign: 'right', fontSize: '12.5px', fontWeight: 700 }}>
                              {m.away_team?.name}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Admin Report snippet if available */}
                      {dayGroup.matches?.some((m) => m.report && m.report.content) && (
                        <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(201, 162, 39, 0.1)', border: '1px solid rgba(201, 162, 39, 0.3)', borderRadius: '6px', fontSize: '11px', color: '#FCD34D' }}>
                          📝 <strong>Included Admin Game Reports:</strong>{' '}
                          {dayGroup.matches
                            .filter((m) => m.report && m.report.content)
                            .map((m) => `${m.home_team?.name} vs ${m.away_team?.name}: "${m.report.title || 'Match Report'}"`)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: TACTICAL & DISCIPLINARY TRENDS */}
              {activeTab === 'tactical' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Tactical Points */}
                  <div style={{ background: '#061C14', border: '1px solid #1E4636', borderRadius: '10px', padding: '14px 18px' }}>
                    <div style={{ fontSize: '11.5px', color: '#C9A227', textTransform: 'uppercase', fontWeight: 800, marginBottom: '8px' }}>
                      🔍 Tactical Trends &amp; Pitch Dynamics
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#D1D5DB', lineHeight: '1.7' }}>
                      {(analysis.tactical_trends || []).map((trend, i) => (
                        <li key={i}>{trend}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Disciplinary Summary */}
                  <div style={{ background: '#061C14', border: '1px solid #1E4636', borderRadius: '10px', padding: '14px 18px' }}>
                    <div style={{ fontSize: '11.5px', color: '#F87171', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' }}>
                      ⚖️ Disciplinary &amp; Fair Play Analysis
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#D1D5DB', lineHeight: '1.6' }}>
                      {analysis.disciplinary_summary || 'No disciplinary concerns recorded.'}
                    </div>
                  </div>

                  {/* Upcoming Week Outlook */}
                  {analysis.next_week_preview && (
                    <div style={{ background: '#061C14', border: '1px solid #1E4636', borderLeft: '4px solid #4ADE80', borderRadius: '10px', padding: '14px 18px' }}>
                      <div style={{ fontSize: '11.5px', color: '#4ADE80', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' }}>
                        🔮 Matchweek Forward Outlook
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#D1D5DB', lineHeight: '1.6' }}>
                        {analysis.next_week_preview}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: RAW JSON VIEW */}
              {activeTab === 'json' && (
                <pre
                  style={{
                    background: '#04120D',
                    border: '1px solid #1E4636',
                    borderRadius: '8px',
                    padding: '14px',
                    fontSize: '11px',
                    color: '#6CE5A0',
                    overflowX: 'auto',
                    maxHeight: '400px',
                  }}
                >
                  {JSON.stringify(reportData, null, 2)}
                </pre>
              )}
            </div>
          ) : null}
        </div>

        {/* Modal Action Bar (Bottom) */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid #1E4636',
            background: '#061913',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleCopySummary}
              style={{
                background: '#133A2D',
                border: '1px solid #2B6B50',
                color: '#DDE6DF',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copied ? '✅ Copied to Clipboard!' : '📋 Copy Summary'}
            </button>

            <button
              type="button"
              onClick={handleDownloadJSON}
              style={{
                background: '#133A2D',
                border: '1px solid #2B6B50',
                color: '#DDE6DF',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📥 Export JSON Data
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                background: 'linear-gradient(135deg, #0B3A2E 0%, #14532D 100%)',
                border: '1px solid #C9A227',
                color: '#C9A227',
                borderRadius: '8px',
                padding: '8px 18px',
                fontSize: '12px',
                fontWeight: 800,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(11, 58, 46, 0.4)',
              }}
              title="Open full official printable PDF dossier in browser"
            >
              🖨️ View &amp; Print Official PDF
            </a>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#16352A',
                border: '1px solid #2B5746',
                color: '#F4F2EA',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
