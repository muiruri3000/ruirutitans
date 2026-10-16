import React from 'react';

export default function TopNav({ syncStatus }) {
  const statusText =
    syncStatus === 'synced'
      ? 'MySQL DB Synced'
      : syncStatus === 'saving'
      ? 'Saving to MySQL…'
      : 'Offline / Sync error';

  return (
    <div className="top-nav-bar">
      <div className="sync-badge">
        <span className={`sync-dot ${syncStatus}`} />
        <span>{statusText}</span>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <a
          href="/admin/"
          target="_blank"
          rel="noreferrer"
          className="admin-link"
          title="Open Django Admin (MySQL Backend)"
        >
          ⚙️ Django Admin
        </a>
        <a
          href="/api/state/"
          target="_blank"
          rel="noreferrer"
          className="admin-link"
          style={{ background: 'transparent', color: '#8FA89B', borderColor: '#2B4E40' }}
          title="Direct REST API Endpoint"
        >
          {'{ }'} REST API
        </a>
      </div>
    </div>
  );
}

