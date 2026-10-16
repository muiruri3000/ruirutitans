import React from 'react';

const thNum = { padding: '6px 8px', textAlign: 'center' };
const tdNum = { padding: '7px 8px', textAlign: 'center' };

export default function TableView({ table, teamCount, activeCategoryKey }) {
  if (teamCount === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8FA89B' }}>
        No teams yet in this category — head to Manage to add teams and fixtures.
      </div>
    );
  }

  const anyTied = table.some((r, i) => i > 0 && r.Pts === table[i - 1].Pts && r.GD === table[i - 1].GD && r.GF === table[i - 1].GF);

  return (
    <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '12px', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid #1E4636',
          background: '#0A241C',
        }}
      >
        <span style={{ fontWeight: 700, color: '#C9A227', fontSize: '13px', letterSpacing: '0.05em' }}>
          STANDINGS TABLE
        </span>
        <a
          href={`/api/categories/${activeCategoryKey}/export/standings-csv/`}
          className="csv-export-btn"
          title="Download standings table as CSV spreadsheet"
        >
          📥 Export Table CSV
        </a>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#F4F2EA', fontSize: '13px' }}>
          <thead>
            <tr style={{ color: '#8FA89B', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px' }}>Team</th>
              <th style={thNum}>P</th>
              <th style={thNum}>W</th>
              <th style={thNum}>D</th>
              <th style={thNum}>L</th>
              <th style={thNum}>GD</th>
              <th style={thNum}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r, i) => {
              const isTied = i > 0 && r.Pts === table[i - 1].Pts && r.GD === table[i - 1].GD && r.GF === table[i - 1].GF;
              return (
                <tr
                  key={r.id}
                  style={{
                    borderTop: '1px solid #16352A',
                    background: i === 0 ? 'rgba(201,162,39,0.06)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', color: '#6E9080', width: '16px', textAlign: 'right' }}>
                      {isTied ? '=' : i + 1}
                    </span>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '4px',
                        background: r.color,
                        display: 'inline-block',
                      }}
                    />
                    <strong>{r.name}</strong>
                  </td>
                  <td style={tdNum}>{r.P}</td>
                  <td style={tdNum}>{r.W}</td>
                  <td style={tdNum}>{r.D}</td>
                  <td style={tdNum}>{r.L}</td>
                  <td style={tdNum}>{r.GD > 0 ? `+${r.GD}` : r.GD}</td>
                  <td style={{ ...tdNum, fontWeight: 800, color: '#C9A227' }}>{r.Pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {anyTied && (
        <div style={{ padding: '8px 12px', fontSize: '10.5px', color: '#5E7A6C', borderTop: '1px solid #1E4636' }}>
          &quot;=&quot; marks teams level on points, goal difference, and goals scored — a genuine tie, neither ranked above the other.
        </div>
      )}
    </div>
  );
}

