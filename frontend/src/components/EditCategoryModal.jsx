import React, { useState, useEffect } from 'react';

const DAYS_MAP = [
  { num: 1, label: 'Mon' },
  { num: 2, label: 'Tue' },
  { num: 3, label: 'Wed' },
  { num: 4, label: 'Thu' },
  { num: 5, label: 'Fri' },
  { num: 6, label: 'Sat' },
  { num: 0, label: 'Sun' },
];

export default function EditCategoryModal({
  isOpen,
  categoryKey,
  category,
  onClose,
  onSaveCategory,
  onDeleteCategory,
}) {
  const [label, setLabel] = useState('');
  const [format, setFormat] = useState('double');
  const [mode, setMode] = useState('league');
  const [note, setNote] = useState('');
  const [startDate, setStartDate] = useState('');
  const [rescheduleUnplayed, setRescheduleUnplayed] = useState(true);
  const [defaultTime, setDefaultTime] = useState('15:00');
  const [matchesPerDay, setMatchesPerDay] = useState(1);
  const [venue, setVenue] = useState('Thoome Pri.');
  const [daysConfig, setDaysConfig] = useState({});
  const [refereesInput, setRefereesInput] = useState('');
  const [votingTeamSize, setVotingTeamSize] = useState(6);
  const [votingMaxPicks, setVotingMaxPicks] = useState(2);
  const [votingIncludeGk, setVotingIncludeGk] = useState(true);
  const [isEnded, setIsEnded] = useState(false);
  const [championTeam, setChampionTeam] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (!category) return;
    setLabel(category.label || categoryKey || '');
    setFormat(category.format || 'double');
    setMode(category.mode || 'league');
    setNote(category.note || '');

    const sched = category.schedule || {};
    setStartDate(sched.startDate || sched.start_date || '');
    setDefaultTime(sched.time || '15:00');
    setMatchesPerDay(sched.matches_per_day || sched.fixtures_per_day || 1);
    setVenue(sched.venue || 'Thoome Pri.');

    // Parse daysConfig
    const rawDays = sched.days;
    const cfg = {};
    for (let d = 0; d < 7; d++) {
      cfg[d] = { enabled: false, matches: 1, time: sched.time || '15:00' };
    }
    if (Array.isArray(rawDays)) {
      rawDays.forEach((d) => {
        if (typeof d === 'number' && d >= 0 && d <= 6) {
          cfg[d] = { enabled: true, matches: sched.matches_per_day || 1, time: sched.time || '15:00' };
        } else if (d && typeof d === 'object') {
          const num = Number(d.day ?? d.num);
          if (!isNaN(num) && num >= 0 && num <= 6) {
            cfg[num] = {
              enabled: d.enabled !== false,
              matches: Math.max(1, parseInt(d.matches || sched.matches_per_day || 1, 10)),
              time: d.time || sched.time || '15:00',
            };
          }
        }
      });
    } else if (rawDays && typeof rawDays === 'object') {
      Object.entries(rawDays).forEach(([k, v]) => {
        const dNum = Number(k);
        if (!isNaN(dNum) && dNum >= 0 && dNum <= 6) {
          if (typeof v === 'number') {
            cfg[dNum] = { enabled: v > 0, matches: Math.max(1, v), time: sched.time || '15:00' };
          } else if (typeof v === 'boolean') {
            cfg[dNum] = { enabled: v, matches: sched.matches_per_day || 1, time: sched.time || '15:00' };
          } else if (v && typeof v === 'object') {
            cfg[dNum] = {
              enabled: v.enabled !== false,
              matches: Math.max(1, parseInt(v.matches || sched.matches_per_day || 1, 10)),
              time: v.time || sched.time || '15:00',
            };
          }
        }
      });
    } else {
      // Default Sat/Sun enabled
      cfg[6] = { enabled: true, matches: 2, time: sched.time || '15:00' };
      cfg[0] = { enabled: true, matches: 2, time: sched.time || '15:00' };
    }
    setDaysConfig(cfg);

    const refs = category.referees || [];
    setRefereesInput(refs.join(', '));

    const vc = category.votingConfig || {};
    setVotingTeamSize(vc.team_size || 6);
    setVotingMaxPicks(vc.max_picks_per_position || 2);
    setVotingIncludeGk(vc.include_gk !== false);

    setIsEnded(Boolean(category.isEnded || category.is_ended));
    setChampionTeam(category.championTeam || category.champion_team || '');
    setSuccessMsg(null);
  }, [category, categoryKey, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !category) return null;

  const handleToggleDay = (dayNum) => {
    setDaysConfig((prev) => ({
      ...prev,
      [dayNum]: {
        ...prev[dayNum],
        enabled: !prev[dayNum]?.enabled,
      },
    }));
  };

  const handleUpdateDayMatches = (dayNum, count) => {
    setDaysConfig((prev) => ({
      ...prev,
      [dayNum]: {
        ...prev[dayNum],
        matches: Math.max(1, parseInt(count, 10) || 1),
      },
    }));
  };

  const handleUpdateDayTime = (dayNum, timeVal) => {
    setDaysConfig((prev) => ({
      ...prev,
      [dayNum]: {
        ...prev[dayNum],
        time: timeVal,
      },
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);

    const parsedRefs = refereesInput
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const updatedSchedule = {
      time: defaultTime || '15:00',
      matches_per_day: Math.max(1, parseInt(matchesPerDay, 10) || 1),
      venue: venue.trim() || 'Thoome Pri.',
      days: daysConfig,
      ...(startDate ? { startDate, start_date: startDate } : {}),
    };

    const updatedVotingConfig = {
      team_size: Math.max(1, parseInt(votingTeamSize, 10) || 6),
      max_picks_per_position: Math.max(1, parseInt(votingMaxPicks, 10) || 2),
      include_gk: Boolean(votingIncludeGk),
    };

    const updatedFields = {
      label: label.trim(),
      format,
      mode,
      note: note.trim(),
      schedule: updatedSchedule,
      referees: parsedRefs,
      votingConfig: updatedVotingConfig,
      isEnded,
      championTeam: championTeam.trim(),
    };

    if (onSaveCategory) {
      onSaveCategory(categoryKey, updatedFields, rescheduleUnplayed);
    }

    setSaving(false);
    setSuccessMsg('✅ League settings and schedule saved successfully!');
    setTimeout(() => {
      onClose();
    }, 800);
  };

  const teams = category.teams || [];

  return (
    <div
      className="h2h-overlay"
      style={{
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target.className === 'h2h-overlay') onClose();
      }}
    >
      <div
        className="team-modal"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#121212',
          border: '2px solid #FF9500',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.85)',
          color: '#FFFFFF',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '14px',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>✏️</span>
            <div>
              <h2
                className="scoreboard"
                style={{ margin: 0, fontSize: '20px', color: '#FF9500', letterSpacing: '0.04em' }}
              >
                EDIT COMPETITION / LEAGUE
              </h2>
              <div style={{ fontSize: '12px', color: '#8E8E93' }}>
                Key: <code style={{ color: '#6CE5A0' }}>{categoryKey}</code> · {category.mode === 'cup' ? 'Knockout Cup' : 'League Competition'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8E8E93',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
            title="Close editor"
          >
            ✕
          </button>
        </div>

        {successMsg && (
          <div
            style={{
              background: 'rgba(108, 229, 160, 0.15)',
              border: '1px solid #3F7A4E',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '16px',
              color: '#6CE5A0',
              fontWeight: 800,
              fontSize: '13px',
            }}
          >
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Section 1: Basic Information */}
          <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>
              📋 1. League Name &amp; Format
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#EBEBF5', marginBottom: '4px' }}>
                  League / Tournament Title *
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Ruiru Titans League - Oct/Nov 2026"
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#EBEBF5', marginBottom: '4px' }}>
                  Round-Robin Format
                </label>
                <select
                  className="form-input"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  disabled={mode === 'cup'}
                  style={{ width: '100%' }}
                >
                  <option value="double">Double Round-Robin (Home &amp; Away)</option>
                  <option value="single">Single Round-Robin (1 Game per pairing)</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#EBEBF5', marginBottom: '4px' }}>
                Competition Notes &amp; Announcements (Optional)
              </label>
              <textarea
                className="form-input"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Important tournament notes, prize info, or kickoff guidelines shown to all players..."
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
          </div>

          {/* Section 2: Kickoff Date & Schedule Rules */}
          <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>
              🗓️ 2. League Start Date &amp; Kickoff Timing
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#6CE5A0', marginBottom: '4px' }}>
                  📅 League Start Date:
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ width: '100%', fontWeight: 800 }}
                  title="First match day start date for the competition"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#EBEBF5', marginBottom: '4px' }}>
                  ⏰ Default Kickoff Time:
                </label>
                <input
                  type="time"
                  className="form-input"
                  value={defaultTime}
                  onChange={(e) => setDefaultTime(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#EBEBF5', marginBottom: '4px' }}>
                  ⚡ Default Matches Per Day:
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  className="form-input"
                  value={matchesPerDay}
                  onChange={(e) => setMatchesPerDay(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#FF9500', marginBottom: '4px' }}>
                  🏟️ Match Venue:
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g. Thoome Pri."
                  style={{ width: '100%', fontWeight: 700 }}
                  title="Primary match venue for this competition"
                />
              </div>
            </div>

            {/* Checkbox: Re-schedule unplayed fixtures */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#121212',
                border: '1px dashed #FF9500',
                borderRadius: '8px',
                padding: '10px 12px',
                cursor: 'pointer',
                marginBottom: '14px',
              }}
            >
              <input
                type="checkbox"
                checked={rescheduleUnplayed}
                onChange={(e) => setRescheduleUnplayed(e.target.checked)}
                style={{ accentColor: '#FF9500', width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '12px', color: '#FFFFFF' }}>
                <strong>⚡ Apply to unplayed matches:</strong> Re-calculate all unplayed fixture dates starting from this chosen start date (games separated by exactly 1 hour).
              </span>
            </label>

            {/* Per-Day Settings Grid */}
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#EBEBF5', marginBottom: '8px' }}>
              Select Active Match Days of the Week:
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '8px',
              }}
            >
              {DAYS_MAP.map((d) => {
                const dayCfg = daysConfig[d.num] || { enabled: false, matches: 1, time: defaultTime };
                const isEnabled = Boolean(dayCfg.enabled);
                return (
                  <div
                    key={d.num}
                    style={{
                      background: isEnabled ? 'rgba(255, 149, 0, 0.12)' : '#121212',
                      border: isEnabled ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleToggleDay(d.num)}
                        style={{ accentColor: '#FF9500' }}
                      />
                      <span style={{ fontSize: '11.5px', fontWeight: 800, color: isEnabled ? '#FF9500' : '#8E8E93' }}>
                        {d.label}
                      </span>
                    </label>
                    {isEnabled && (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={dayCfg.matches || 1}
                          onChange={(e) => handleUpdateDayMatches(d.num, e.target.value)}
                          className="form-input"
                          style={{ width: '45px', padding: '2px 4px', fontSize: '10.5px', textAlign: 'center' }}
                          title="Matches on this day"
                        />
                        <input
                          type="time"
                          value={dayCfg.time || defaultTime}
                          onChange={(e) => handleUpdateDayTime(d.num, e.target.value)}
                          className="form-input"
                          style={{ flex: 1, padding: '2px 4px', fontSize: '10.5px' }}
                          title="Start time"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Referees Pool */}
          <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
              🧑‍⚖️ 3. Competition Referees Pool
            </div>
            <label style={{ display: 'block', fontSize: '11px', color: '#8E8E93', marginBottom: '4px' }}>
              Enter match officials separated by commas (assigned and randomized across matches):
            </label>
            <input
              type="text"
              className="form-input"
              value={refereesInput}
              onChange={(e) => setRefereesInput(e.target.value)}
              placeholder="Ref Kamau, Ref Otieno, Ref Njoroge, Ref Mwangi"
              style={{ width: '100%' }}
            />
          </div>

          {/* Section 4: Voting & Tournament Status */}
          <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>
              🏆 4. Voting &amp; Tournament Status
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#EBEBF5', marginBottom: '4px' }}>
                  TOTW / TOTT Team Size:
                </label>
                <input
                  type="number"
                  min="5"
                  max="11"
                  className="form-input"
                  value={votingTeamSize}
                  onChange={(e) => setVotingTeamSize(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#EBEBF5', marginBottom: '4px' }}>
                  Max Picks Per Position:
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  className="form-input"
                  value={votingMaxPicks}
                  onChange={(e) => setVotingMaxPicks(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11.5px', color: '#EBEBF5' }}>
                  <input
                    type="checkbox"
                    checked={votingIncludeGk}
                    onChange={(e) => setVotingIncludeGk(e.target.checked)}
                    style={{ accentColor: '#FF9500' }}
                  />
                  <span>Include Goalkeeper (GK) in Voting</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', paddingTop: '8px', borderTop: '1px solid #1C1C1E' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#FFFFFF' }}>
                <input
                  type="checkbox"
                  checked={isEnded}
                  onChange={(e) => setIsEnded(e.target.checked)}
                  style={{ accentColor: '#FF9500', width: '16px', height: '16px' }}
                />
                <span>🏆 Mark League as Concluded / Ended</span>
              </label>

              {isEnded && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#FF9500', fontWeight: 700, marginBottom: '2px' }}>
                    Champion Team
                  </label>
                  <select
                    className="form-input"
                    value={championTeam}
                    onChange={(e) => setChampionTeam(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">-- Select Champion Team --</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.name || t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '16px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {onDeleteCategory && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Are you sure you want to soft-delete "${label}"? You can restore it later.`)) {
                    onDeleteCategory(categoryKey);
                    onClose();
                  }
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #EF4444',
                  color: '#FCA5A5',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🗑️ Soft-Delete League
              </button>
            )}

            <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: '#1C1C1E',
                  color: '#EBEBF5',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: '#FF9500',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 24px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(255, 149, 0, 0.3)',
                }}
              >
                {saving ? 'Saving Changes…' : '💾 Save League Settings'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
