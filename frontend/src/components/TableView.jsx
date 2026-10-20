import React from 'react';
import { openCategoryFixturesResultsPDF } from '../utils/pdfExport';

const thNum = { padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdNum = { padding: '10px 8px', textAlign: 'center', fontSize: '13px' };

export default function TableView({ table, teamCount, activeCategoryKey, onSelectTeam }) {
  if (teamCount === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8FA89B', background: '#0F2E24', borderRadius: '14px', border: '1px solid #1E4636' }}>
        No teams yet in this category — sign in to CMS to add teams and fixtures.
      </div>
    );
  }

  const anyTied = table.some((r, i) => i > 0 && r.Pts === table[i - 1].Pts && r.GD === table[i - 1].GD && r.GF === table[i - 1].GF);
  const leader = table.length > 0 ? table[0] : null;
  const second = table.length > 1 ? table[1] : null;
  const totalMatchesPerTeam = teamCount > 1 ? (teamCount - 1) * 2 : 0;
  const isSeasonComplete = totalMatchesPerTeam > 0 && table.length > 0 && table.every((r) => r.P >= totalMatchesPerTeam);
  const isChampionConfirmed = Boolean(
    leader && (isSeasonComplete || (second && leader.Pts > second.Pts + (totalMatchesPerTeam - second.P) * 3))
  );

  return (
    <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '14px', overflow: 'hidden' }}>
      {isChampionConfirmed && leader && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(201, 162, 39, 0.22) 0%, rgba(15, 46, 36, 0.95) 100%)',
            borderBottom: '1px solid #C9A227',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>🏆</span>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 900, color: '#C9A227', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Ruiru Titans August Season League Winners
              </div>
              <div style={{ fontSize: '13px', color: '#F4F2EA', marginTop: '2px' }}>
                🎉 <strong>{leader.name}</strong> confirmed as official League Champions ({leader.Pts} Pts · {leader.W}W {leader.D}D {leader.L}L)!
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                background: 'rgba(201, 162, 39, 0.18)',
                color: '#FCD34D',
                border: '1px solid #C9A227',
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '999px',
                letterSpacing: '0.04em',
              }}
            >
              ⚽ 6-a-side · No Goalkeepers
            </span>
            <span
              style={{
                background: '#C9A227',
                color: '#16201B',
                fontSize: '11px',
                fontWeight: 900,
                padding: '5px 12px',
                borderRadius: '999px',
                letterSpacing: '0.05em',
              }}
            >
              🥇 CHAMPIONS CONFIRMED
            </span>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px',
          borderBottom: '1px solid #1E4636',
          background: '#0A241C',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: '#C9A227', fontSize: '13px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              📊 Official League Standings
            </span>
            <span
              style={{
                background: 'rgba(74, 222, 128, 0.12)',
                color: '#4ADE80',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              6-a-side · No GKs
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#8FA89B', marginTop: '2px' }}>
            6-a-side tournament (No Goalkeepers) · 3 pts for Win · 1 pt for Draw · Ranked by Points, Goal Difference, Goals Scored
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => openCategoryFixturesResultsPDF(activeCategoryKey)}
            style={{
              background: '#0B3A2E',
              color: '#F4F2EA',
              border: '1px solid #2B5746',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Download official fixtures schedule & results PDF report"
          >
            📄 Download Fixtures &amp; Results PDF
          </button>
          <a
            href={`/api/categories/${activeCategoryKey}/export/standings-csv/`}
            className="csv-export-btn"
            title="Download standings table as CSV spreadsheet"
          >
            📥 Export Table CSV
          </a>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#F4F2EA', fontSize: '13px' }}>
          <thead>
            <tr style={{ color: '#8FA89B', textAlign: 'left', background: 'rgba(10, 36, 28, 0.5)' }}>
              <th style={{ padding: '10px 14px', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Club</th>
              <th style={thNum}>P</th>
              <th style={thNum}>W</th>
              <th style={thNum}>D</th>
              <th style={thNum}>L</th>
              <th style={thNum}>GF</th>
              <th style={thNum}>GA</th>
              <th style={thNum}>GD</th>
              <th style={thNum}>Pts</th>
              <th style={{ ...thNum, textAlign: 'right', paddingRight: '14px' }}>Form</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r, i) => {
              const isTied = i > 0 && r.Pts === table[i - 1].Pts && r.GD === table[i - 1].GD && r.GF === table[i - 1].GF;
              const isLeader = i === 0;
              return (
                <tr
                  key={r.id}
                  style={{
                    borderTop: '1px solid #16352A',
                    background: isLeader ? 'rgba(201,162,39,0.08)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        color: isLeader ? '#C9A227' : '#8FA89B',
                        width: '20px',
                        height: '20px',
                        borderRadius: '5px',
                        background: isLeader ? 'rgba(201,162,39,0.2)' : '#16352A',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isTied ? '=' : i + 1}
                    </span>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: r.color,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    {onSelectTeam ? (
                      <button
                        type="button"
                        className="team-link-btn"
                        onClick={() => onSelectTeam(r.id, activeCategoryKey)}
                        style={{ fontWeight: 800, fontSize: '13.5px', color: '#F4F2EA' }}
                        title={`Click to view ${r.name} performance analysis, history & tournament odds`}
                      >
                        {r.name}
                      </button>
                    ) : (
                      <strong style={{ color: '#F4F2EA', fontSize: '13.5px' }}>{r.name}</strong>
                    )}
                    {isLeader && (
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 800,
                          background: '#C9A227',
                          color: '#16201B',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {isChampionConfirmed ? '🏆 CHAMPION' : 'LEADER'}
                      </span>
                    )}
                  </td>
                  <td style={tdNum}>{r.P}</td>
                  <td style={{ ...tdNum, color: '#4ADE80', fontWeight: 600 }}>{r.W}</td>
                  <td style={{ ...tdNum, color: '#FACC15' }}>{r.D}</td>
                  <td style={{ ...tdNum, color: '#F87171' }}>{r.L}</td>
                  <td style={{ ...tdNum, color: '#9BB5A8' }}>{r.GF}</td>
                  <td style={{ ...tdNum, color: '#9BB5A8' }}>{r.GA}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: r.GD > 0 ? '#4ADE80' : r.GD < 0 ? '#F87171' : '#8FA89B' }}>
                    {r.GD > 0 ? `+${r.GD}` : r.GD}
                  </td>
                  <td style={{ ...tdNum, fontWeight: 900, fontSize: '15px', color: '#C9A227' }}>{r.Pts}</td>
                  <td style={{ ...tdNum, textAlign: 'right', paddingRight: '14px' }}>
                    <div style={{ display: 'inline-flex', gap: '3px', justifyContent: 'flex-end' }}>
                      {(r.form || []).slice(-5).map((res, idx) => (
                        <span key={idx} className={`form-badge ${res}`} style={{ width: '18px', height: '18px', fontSize: '10px' }}>
                          {res}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {anyTied && (
        <div style={{ padding: '8px 14px', fontSize: '11px', color: '#8FA89B', borderTop: '1px solid #1E4636', background: '#0A241C' }}>
          &quot;=&quot; marks clubs level on points, goal difference, and goals scored.
        </div>
      )}
    </div>
  );
}
