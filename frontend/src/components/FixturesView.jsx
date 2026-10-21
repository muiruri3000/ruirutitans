import React, { useState, useEffect } from 'react';
import { openCategoryFixturesResultsPDF } from '../utils/pdfExport';

export const formatDateWithTime = (dateStr, timeStr = '15:00') => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dt = new Date(y, m, d);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${dayNames[dt.getDay()]}, ${String(d).padStart(2, '0')} ${monthNames[m]} · ${timeStr}`;
  }
  return `${dateStr} · ${timeStr}`;
};

export const parseDaysConfig = (rawDays, defaultTime = '15:00', defaultCount = 1) => {
  const config = {
    1: { enabled: false, matches: defaultCount, time: defaultTime }, // Mon
    2: { enabled: false, matches: defaultCount, time: defaultTime }, // Tue
    3: { enabled: false, matches: defaultCount, time: defaultTime }, // Wed
    4: { enabled: false, matches: defaultCount, time: defaultTime }, // Thu
    5: { enabled: false, matches: defaultCount, time: defaultTime }, // Fri
    6: { enabled: true, matches: Math.max(1, defaultCount), time: defaultTime }, // Sat
    0: { enabled: true, matches: Math.max(1, defaultCount), time: defaultTime }, // Sun
  };
  if (Array.isArray(rawDays)) {
    rawDays.forEach((item) => {
      if (typeof item === 'number' && config[item]) {
        config[item].enabled = true;
      } else if (item && typeof item === 'object') {
        const dNum = Number(item.day ?? item.num ?? item.dayNum);
        if (config[dNum]) {
          config[dNum] = {
            enabled: item.enabled !== false,
            matches: Math.max(1, parseInt(item.matches || item.count || defaultCount, 10)),
            time: item.time || defaultTime,
          };
        }
      }
    });
  } else if (rawDays && typeof rawDays === 'object') {
    Object.entries(rawDays).forEach(([k, v]) => {
      const dNum = Number(k);
      if (config[dNum]) {
        if (typeof v === 'number') {
          config[dNum] = { enabled: v > 0, matches: Math.max(1, v), time: defaultTime };
        } else if (typeof v === 'boolean') {
          config[dNum] = { enabled: v, matches: defaultCount, time: defaultTime };
        } else if (v && typeof v === 'object') {
          config[dNum] = {
            enabled: v.enabled !== false,
            matches: Math.max(1, parseInt(v.matches || v.count || defaultCount, 10)),
            time: v.time || defaultTime,
          };
        }
      }
    });
  }
  return config;
};

export default function FixturesView({
  fixtures,
  teamsById,
  suspensions,
  referees,
  schedule,
  activeCategoryKey,
  categoryLabel = '',
  isCmsMode = false,
  initialFilter = 'all',
  onTogglePlayed,
  onAddEvent,
  onRemoveEvent,
  onSetWalkover,
  onSetReferee,
  onAddReferee,
  onRemoveReferee,
  onRandomizeReferees,
  onUpdateSchedule,
  onMoveFixture,
  onBatchMoveFixtures,
  onOpenH2H,
  onGenerateFixtures,
  onOpenEditCategory,
  onSelectTeam,
}) {
  const [openFixtureIds, setOpenFixtureIds] = useState({});
  const [recentlyEditedIds, setRecentlyEditedIds] = useState({});
  const [statusFilter, setStatusFilter] = useState(initialFilter); // 'all' | 'results' | 'upcoming'
  const [teamFilter, setTeamFilter] = useState('');
  const [newRefInput, setNewRefInput] = useState('');

  // Per-fixture goal recording draft state { [fId]: { [teamId]: { playerId, type: 'goal'|'penalty'|'owngoal', assistPlayerId } } }
  const [goalDrafts, setGoalDrafts] = useState({});
  // Per-fixture interference card booking state { [fId]: { teamId, playerId, type: 'yellow'|'red' } }
  const [interfDrafts, setInterfDrafts] = useState({});

  // Tournament Scheduling Configuration state (per-day matches, kickoff time, 1hr spacing)
  const [scheduleTime, setScheduleTime] = useState(schedule?.time || '15:00');
  const [scheduleStartDate, setScheduleStartDate] = useState(
    schedule?.startDate || schedule?.start_date || ''
  );
  const [daysConfig, setDaysConfig] = useState(() =>
    parseDaysConfig(schedule?.days, schedule?.time || '15:00', schedule?.matches_per_day || 1)
  );
  const [fixturesPerDay, setFixturesPerDay] = useState(
    schedule?.matches_per_day || schedule?.fixtures_per_day || 1
  );
  const [showScheduleConfig, setShowScheduleConfig] = useState(false);

  // Single fixture moving state
  const [movingFixtureId, setMovingFixtureId] = useState(null);
  const [moveDateInput, setMoveDateInput] = useState('');
  const [moveTimeInput, setMoveTimeInput] = useState('15:00');

  // Bulk move state
  const [showBulkMoveTool, setShowBulkMoveTool] = useState(false);
  const [selectedForMove, setSelectedForMove] = useState({}); // { [fId]: boolean }
  const [bulkMoveDate, setBulkMoveDate] = useState('');
  const [bulkMoveTime, setBulkMoveTime] = useState('15:00');
  const [bulkSpaceOneHour, setBulkSpaceOneHour] = useState(true);

  useEffect(() => {
    setStatusFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (schedule?.time) setScheduleTime(schedule.time);
    if (schedule?.startDate || schedule?.start_date) {
      setScheduleStartDate(schedule.startDate || schedule.start_date);
    }
    if (schedule?.days) {
      setDaysConfig(parseDaysConfig(schedule.days, schedule.time || '15:00', schedule.matches_per_day || 1));
    }
    if (schedule?.matches_per_day || schedule?.fixtures_per_day) {
      setFixturesPerDay(schedule.matches_per_day || schedule.fixtures_per_day);
    }
  }, [schedule]);

  const teamsList = Object.values(teamsById || {});

  const handleQuickAddReferees = (e) => {
    e.preventDefault();
    if (!newRefInput.trim() || !onAddReferee) return;
    const names = newRefInput
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    names.forEach((n) => onAddReferee(n));
    setNewRefInput('');
  };

  const handleToggleScheduleDay = (dayNum) => {
    setDaysConfig((prev) => ({
      ...prev,
      [dayNum]: {
        ...prev[dayNum],
        enabled: !prev[dayNum].enabled,
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

  const handleSaveSchedule = (applyToUnplayed = false) => {
    if (!onUpdateSchedule) return;
    const newSchedule = {
      time: scheduleTime || '15:00',
      days: daysConfig,
      matches_per_day: Math.max(1, parseInt(fixturesPerDay, 10) || 1),
      startDate: scheduleStartDate,
      start_date: scheduleStartDate,
    };
    onUpdateSchedule(newSchedule, applyToUnplayed);
  };

  const handleConfirmSingleMove = (fixtureId) => {
    if (!moveDateInput || !onMoveFixture) return;
    const formatted = formatDateWithTime(moveDateInput, moveTimeInput || '15:00');
    onMoveFixture(fixtureId, formatted);
    setMovingFixtureId(null);
    setMoveDateInput('');
  };

  const handleToggleSelectFixtureForMove = (fixtureId) => {
    setSelectedForMove((prev) => ({
      ...prev,
      [fixtureId]: !prev[fixtureId],
    }));
  };

  const handleSelectAllUnplayedForMove = () => {
    const unplayed = fixtures.filter((f) => !f.played && !f.walkover);
    const allSelected = unplayed.length > 0 && unplayed.every((f) => selectedForMove[f.id]);
    const next = {};
    if (!allSelected) {
      unplayed.forEach((f) => {
        next[f.id] = true;
      });
    }
    setSelectedForMove(next);
  };

  const handleConfirmBulkMove = () => {
    const selectedIds = Object.keys(selectedForMove).filter((id) => selectedForMove[id]);
    if (!selectedIds.length || !bulkMoveDate || !onBatchMoveFixtures) return;

    const parts = bulkMoveDate.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dt = new Date(y, m, d);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const [hStr, mStr] = (bulkMoveTime || '15:00').split(':');
    const hBase = parseInt(hStr || '15', 10);
    const mBase = parseInt(mStr || '00', 10);

    const dateMap = {};
    selectedIds.forEach((fId, idx) => {
      // 1 hour difference between games played on the same day!
      const totalMins = hBase * 60 + mBase + (bulkSpaceOneHour ? idx * 60 : 0);
      const matchHour = Math.floor(totalMins / 60) % 24;
      const matchMin = totalMins % 60;
      const tStr = `${String(matchHour).padStart(2, '0')}:${String(matchMin).padStart(2, '0')}`;
      dateMap[fId] = `${dayNames[dt.getDay()]}, ${String(d).padStart(2, '0')} ${monthNames[m]} · ${tStr}`;
    });

    onBatchMoveFixtures(dateMap);
    setSelectedForMove({});
    setBulkMoveDate('');
    setShowBulkMoveTool(false);
  };

  const updateGoalDraft = (fId, teamId, field, value) => {
    setGoalDrafts((prev) => {
      const fDraft = prev[fId] || {};
      const tDraft = fDraft[teamId] || { playerId: '', type: 'goal', assistPlayerId: '' };
      return {
        ...prev,
        [fId]: {
          ...fDraft,
          [teamId]: {
            ...tDraft,
            [field]: value,
          },
        },
      };
    });
  };

  const updateInterfDraft = (fId, field, value) => {
    setInterfDrafts((prev) => {
      const current = prev[fId] || { teamId: '', playerId: '', type: 'yellow' };
      const next = { ...current, [field]: value };
      if (field === 'teamId') next.playerId = ''; // reset player when team changes
      return { ...prev, [fId]: next };
    });
  };

  const handleRecordGoal = (fId, teamId) => {
    const draft = goalDrafts[fId]?.[teamId];
    if (!draft || !draft.playerId) return;

    const ev = {
      teamId: teamId,
      playerId: draft.playerId,
      type: draft.type === 'owngoal' ? 'owngoal' : 'goal',
    };
    if (draft.type === 'penalty') {
      ev.penalty = true;
    }
    if (draft.type === 'goal' && draft.assistPlayerId) {
      ev.assistPlayerId = draft.assistPlayerId;
    }

    setRecentlyEditedIds((prev) => ({ ...prev, [fId]: true }));
    setOpenFixtureIds((prev) => ({ ...prev, [fId]: true }));

    onAddEvent(fId, ev);
    // Reset draft
    updateGoalDraft(fId, teamId, 'playerId', '');
    updateGoalDraft(fId, teamId, 'assistPlayerId', '');
    updateGoalDraft(fId, teamId, 'type', 'goal');
  };

  const handleRecordInterference = (fId) => {
    const draft = interfDrafts[fId];
    if (!draft || !draft.teamId || !draft.playerId) return;
    setRecentlyEditedIds((prev) => ({ ...prev, [fId]: true }));
    setOpenFixtureIds((prev) => ({ ...prev, [fId]: true }));
    onAddEvent(fId, {
      teamId: draft.teamId,
      playerId: draft.playerId,
      type: draft.type || 'yellow',
      interference: true,
    });
    // Reset draft
    setInterfDrafts((prev) => ({ ...prev, [fId]: { teamId: '', playerId: '', type: 'yellow' } }));
  };

  if (!fixtures || fixtures.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8FA89B', background: '#0F2E24', borderRadius: '14px', border: '1px solid #1E4636' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#F4F2EA', marginBottom: '8px' }}>
          No fixtures generated yet for {categoryLabel || activeCategoryKey} ({teamsList.length} teams registered).
        </div>
        {teamsList.length >= 2 && onGenerateFixtures ? (
          <button
            type="button"
            onClick={() => onGenerateFixtures(activeCategoryKey)}
            style={{
              marginTop: '10px',
              background: '#C9A227',
              color: '#16201B',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            ⚡ Generate Fixtures for {categoryLabel || 'Competition'} ({teamsList.length} Teams)
          </button>
        ) : (
          <div>Add or balance at least 2 teams to generate fixtures for this competition.</div>
        )}
      </div>
    );
  }

  const toggleOpen = (fId) => {
    setOpenFixtureIds((prev) => ({ ...prev, [fId]: !prev[fId] }));
  };

  const resultsCount = fixtures.filter((f) => f.played || f.walkover).length;
  const upcomingCount = fixtures.filter((f) => !f.played && !f.walkover).length;

  const filteredFixtures = fixtures.filter((f) => {
    // In CMS mode, if a fixture is currently open or was recently edited, keep it visible
    // so recording goals or toggling played status never makes the fixture suddenly disappear!
    if (isCmsMode && (openFixtureIds[f.id] || recentlyEditedIds[f.id])) return true;

    const isCompleted = Boolean(f.played || f.walkover);
    if (statusFilter === 'results' && !isCompleted) return false;
    if (statusFilter === 'upcoming' && isCompleted) return false;
    if (teamFilter && f.home !== teamFilter && f.away !== teamFilter) return false;
    return true;
  });

  const DAYS_MAP = [
    { num: 1, label: 'Mon' },
    { num: 2, label: 'Tue' },
    { num: 3, label: 'Wed' },
    { num: 4, label: 'Thu' },
    { num: 5, label: 'Fri' },
    { num: 6, label: 'Sat' },
    { num: 0, label: 'Sun' },
  ];

  return (
    <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '14px', padding: '16px' }}>
      {/* Header & Filter Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '14px',
          paddingBottom: '12px',
          borderBottom: '1px solid #1E4636',
        }}
      >
        <div>
          <span style={{ fontWeight: 800, color: '#C9A227', fontSize: '13px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            ⚽ {categoryLabel ? `${categoryLabel} — ` : ''}Match Results &amp; Fixtures Schedule
          </span>
          <div style={{ fontSize: '11.5px', color: '#8FA89B', marginTop: '2px' }}>
            {resultsCount} completed results · {upcomingCount} upcoming fixtures
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Status filter pills */}
          <div style={{ display: 'flex', background: '#09221A', padding: '3px', borderRadius: '8px', border: '1px solid #1E4636' }}>
            {[
              { key: 'all', label: `All (${fixtures.length})` },
              { key: 'results', label: `✅ Match Results (${resultsCount})` },
              { key: 'upcoming', label: `📅 Upcoming (${upcomingCount})` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.key);
                  setRecentlyEditedIds({});
                }}
                style={{
                  background: statusFilter === tab.key ? '#C9A227' : 'transparent',
                  color: statusFilter === tab.key ? '#16201B' : '#8FA89B',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Team filter */}
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            style={{
              background: '#16352A',
              color: '#F4F2EA',
              border: '1px solid #2B4E40',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <option value="">All Teams</option>
            {teamsList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {isCmsMode && (
            <button
              type="button"
              onClick={() => setShowScheduleConfig(!showScheduleConfig)}
              style={{
                background: showScheduleConfig ? '#C9A227' : '#16352A',
                color: showScheduleConfig ? '#16201B' : '#DDE6DF',
                border: '1px solid #2F7D5C',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
              title="Configure match days of week, kickoff times, and number of fixtures per day"
            >
              🗓️ Match Days &amp; Schedule
            </button>
          )}

          {isCmsMode && onRandomizeReferees && (referees || []).length > 0 && upcomingCount > 0 && (
            <button
              type="button"
              onClick={() => onRandomizeReferees(activeCategoryKey)}
              style={{
                background: '#16352A',
                color: '#6CE5A0',
                border: '1px solid #2F7D5C',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
              title="Randomly assign referees from this competition's referee pool to all unplayed fixtures"
            >
              🎲 Randomize Referees (Unplayed)
            </button>
          )}

          {isCmsMode && onGenerateFixtures && teamsList.length >= 2 && (
            <button
              type="button"
              onClick={() => onGenerateFixtures(activeCategoryKey)}
              style={{
                background: '#16352A',
                color: '#C9A227',
                border: '1px solid #C9A227',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
              title="Regenerate fixtures for all teams using current schedule rules"
            >
              ⚡ Regenerate Fixtures
            </button>
          )}

          {isCmsMode && onOpenEditCategory && (
            <button
              type="button"
              onClick={onOpenEditCategory}
              style={{
                background: '#C9A227',
                color: '#16201B',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Edit league name, format, start date, referees and settings"
            >
              ✏️ Edit League
            </button>
          )}

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
            📄 Download PDF
          </button>

          <a
            href={`/api/categories/${activeCategoryKey}/export/fixtures-csv/`}
            className="csv-export-btn"
            title="Download fixtures schedule and results as CSV"
          >
            📥 Export CSV
          </a>
        </div>
      </div>

      {/* TOURNAMENT MATCH SCHEDULING CONFIGURATION BAR (ADMIN) */}
      {isCmsMode && showScheduleConfig && (
        <div
          style={{
            background: '#08231B',
            border: '2px solid #C9A227',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                🗓️ Match Days &amp; Per-Day Fixtures Configuration
              </span>
              <div style={{ fontSize: '11.5px', color: '#8FA89B', marginTop: '2px' }}>
                Configure the number of games played on each specific day of the week. Games on the same day are separated by <strong>exactly 1 hour</strong>.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setShowBulkMoveTool(!showBulkMoveTool)}
                style={{
                  background: showBulkMoveTool ? '#C9A227' : '#16352A',
                  color: showBulkMoveTool ? '#16201B' : '#DDE6DF',
                  border: '1px solid #2B5746',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {showBulkMoveTool ? '✕ Hide Bulk Move' : '📦 Move Fixtures to Another Day'}
              </button>
              <button
                type="button"
                onClick={() => setShowScheduleConfig(false)}
                style={{ background: 'transparent', border: 'none', color: '#8FA89B', cursor: 'pointer', fontSize: '12px' }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* 1. Global Start Time & Info Strip */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: '#0F2E24', padding: '10px 12px', borderRadius: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#DDE6DF', marginBottom: '3px' }}>
                Fixture / Start Date:
              </label>
              <input
                type="date"
                className="form-input"
                value={scheduleStartDate}
                onChange={(e) => setScheduleStartDate(e.target.value)}
                style={{ width: '135px', fontSize: '12px', padding: '5px 8px' }}
                title="First match day start date for this competition"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#DDE6DF', marginBottom: '3px' }}>
                Default Kickoff Time:
              </label>
              <input
                type="time"
                className="form-input"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                style={{ width: '115px', fontSize: '12px', padding: '5px 8px' }}
              />
            </div>
            <div style={{ flex: '1 1 240px', fontSize: '11px', color: '#6CE5A0', lineHeight: 1.4 }}>
              ⚡ <strong>1-Hour Difference Rule:</strong> All fixtures scheduled on the same date start 1 hour apart (e.g. 14:00, 15:00, 16:00).
            </div>
          </div>

          {/* 2. Per-Day Configuration Grid */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#DDE6DF', marginBottom: '6px' }}>
              Number of Games &amp; Start Time Set on a Per-Day Basis:
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '8px',
              }}
            >
              {DAYS_MAP.map((d) => {
                const dayCfg = daysConfig[d.num] || { enabled: false, matches: 1, time: scheduleTime };
                const isEnabled = Boolean(dayCfg.enabled);
                return (
                  <div
                    key={d.num}
                    style={{
                      background: isEnabled ? 'rgba(201, 162, 39, 0.12)' : '#0F2E24',
                      border: isEnabled ? '1px solid #C9A227' : '1px solid #1E4636',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleToggleScheduleDay(d.num)}
                        style={{ accentColor: '#C9A227', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '12px', fontWeight: 800, color: isEnabled ? '#C9A227' : '#8FA89B' }}>
                        {d.label}
                      </span>
                    </label>

                    {isEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: '#8FA89B' }}>Games:</span>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            className="form-input"
                            value={dayCfg.matches || 1}
                            onChange={(e) => handleUpdateDayMatches(d.num, e.target.value)}
                            style={{ width: '56px', fontSize: '11px', padding: '3px 6px', textAlign: 'center' }}
                            title={`Number of games to be played on ${d.label}`}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: '#8FA89B' }}>Start:</span>
                          <input
                            type="time"
                            className="form-input"
                            value={dayCfg.time || scheduleTime}
                            onChange={(e) => handleUpdateDayTime(d.num, e.target.value)}
                            style={{ width: '84px', fontSize: '11px', padding: '3px 4px' }}
                            title={`Kickoff start time for first game on ${d.label}`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action buttons: Save & Apply to unplayed */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '4px' }}>
            <button
              type="button"
              onClick={() => handleSaveSchedule(false)}
              style={{
                background: '#2B5746',
                color: '#F4F2EA',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 14px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              💾 Save Schedule Rules
            </button>
            <button
              type="button"
              onClick={() => handleSaveSchedule(true)}
              style={{
                background: '#C9A227',
                color: '#16201B',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
              title="Recalculate slots for all unplayed fixtures using per-day game limits and 1hr differences"
            >
              ⚡ Re-Schedule All Unplayed Matches
            </button>
          </div>

          {/* BULK MOVE FIXTURES TOOL */}
          {showBulkMoveTool && (
            <div
              style={{
                marginTop: '6px',
                background: '#041610',
                border: '1px dashed #C9A227',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#C9A227' }}>
                📦 Move Multiple Selected Fixtures to Another Day
              </div>
              <div style={{ fontSize: '11px', color: '#8FA89B' }}>
                Tick the fixtures in the list below using their selection checkboxes, then pick the target date and starting kickoff time:
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', color: '#8FA89B', marginBottom: '2px' }}>
                    Target Date:
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={bulkMoveDate}
                    onChange={(e) => setBulkMoveDate(e.target.value)}
                    style={{ width: '150px', fontSize: '12px', padding: '6px 8px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', color: '#8FA89B', marginBottom: '2px' }}>
                    First Match Kickoff:
                  </label>
                  <input
                    type="time"
                    className="form-input"
                    value={bulkMoveTime}
                    onChange={(e) => setBulkMoveTime(e.target.value)}
                    style={{ width: '110px', fontSize: '12px', padding: '6px 8px' }}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#DDE6DF', cursor: 'pointer', paddingBottom: '6px' }}>
                  <input
                    type="checkbox"
                    checked={bulkSpaceOneHour}
                    onChange={(e) => setBulkSpaceOneHour(e.target.checked)}
                    style={{ accentColor: '#C9A227' }}
                  />
                  Space matches 1 hour apart
                </label>
                <button
                  type="button"
                  onClick={handleSelectAllUnplayedForMove}
                  style={{
                    background: '#16352A',
                    color: '#DDE6DF',
                    border: '1px solid #2B5746',
                    borderRadius: '6px',
                    padding: '7px 10px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Select All Unplayed
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkMove}
                  disabled={!bulkMoveDate || Object.values(selectedForMove).filter(Boolean).length === 0}
                  style={{
                    background:
                      bulkMoveDate && Object.values(selectedForMove).filter(Boolean).length > 0
                        ? '#C9A227'
                        : '#16352A',
                    color:
                      bulkMoveDate && Object.values(selectedForMove).filter(Boolean).length > 0
                        ? '#16201B'
                        : '#8FA89B',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '7px 14px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    cursor:
                      bulkMoveDate && Object.values(selectedForMove).filter(Boolean).length > 0
                        ? 'pointer'
                        : 'not-allowed',
                  }}
                >
                  🚀 Move {Object.values(selectedForMove).filter(Boolean).length} Selected Fixture(s)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manager Referees Pool Form & Random Assignment Bar */}
      {isCmsMode && (
        <div
          style={{
            background: '#08231B',
            border: '1px solid #1E4636',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '14px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              🧑‍⚖️ Competition Referees Pool ({(referees || []).length}) — Randomized &amp; Editable for Unplayed Fixtures
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              {(referees || []).length === 0 ? (
                <span style={{ fontSize: '11.5px', color: '#8FA89B' }}>
                  No referees added yet. Add referees on the right to randomize across unplayed fixtures.
                </span>
              ) : (
                (referees || []).map((r, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: '#13362B',
                      border: '1px solid #2B5746',
                      color: '#F4F2EA',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: '999px',
                    }}
                  >
                    <span>🧑‍⚖️ {r}</span>
                    {onRemoveReferee && (
                      <button
                        type="button"
                        onClick={() => onRemoveReferee(r)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#FF9990',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: 0,
                        }}
                        title={`Remove ${r}`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))
              )}
            </div>
          </div>

          <form
            onSubmit={handleQuickAddReferees}
            style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}
          >
            <input
              type="text"
              className="form-input"
              placeholder="Add referee(s), e.g. Ref Kamau, Ref Otieno…"
              value={newRefInput}
              onChange={(e) => setNewRefInput(e.target.value)}
              style={{ minWidth: '230px', fontSize: '12px', padding: '6px 10px' }}
            />
            <button
              type="submit"
              style={{
                background: '#C9A227',
                color: '#16201B',
                border: 'none',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              + Add Referee(s)
            </button>
            {onRandomizeReferees && (referees || []).length > 0 && (
              <button
                type="button"
                onClick={() => onRandomizeReferees(activeCategoryKey)}
                style={{
                  background: '#2E8B57',
                  color: '#F4F2EA',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🎲 Randomize Unplayed
              </button>
            )}
          </form>
        </div>
      )}

      {filteredFixtures.length === 0 && (
        <div style={{ padding: '28px', textAlign: 'center', color: '#8FA89B', fontSize: '13px' }}>
          No matches match the current filter criteria.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredFixtures.map((f) => {
          const home = teamsById[f.home];
          const away = teamsById[f.away];
          const isOpen = !!openFixtureIds[f.id];
          const suspendedList = (suspensions || {})[f.id] || [];
          const isCompleted = Boolean(f.played || f.walkover);

          // Compute scores
          let hs = 0, as = 0;
          if (f.walkover) {
            hs = f.walkover === f.home ? 3 : 0;
            as = f.walkover === f.away ? 3 : 0;
          } else {
            (f.events || []).forEach((e) => {
              if (e.type === 'goal' && e.teamId === f.home) hs++;
              else if (e.type === 'goal' && e.teamId === f.away) as++;
              else if (e.type === 'owngoal' && e.teamId === f.home) as++;
              else if (e.type === 'owngoal' && e.teamId === f.away) hs++;
            });
          }

          const homeScorers = [];
          const awayScorers = [];
          const interferenceEvents = [];

          (f.events || []).forEach((e) => {
            const team = teamsById[e.teamId];
            const p = team?.players?.find((pp) => pp.id === e.playerId);
            const isInterf = Boolean(
              e.interference || (f.home && f.away && e.teamId !== f.home && e.teamId !== f.away)
            );

            if (isInterf && (e.type === 'yellow' || e.type === 'red')) {
              interferenceEvents.push({
                player: p?.name || 'Player',
                teamName: team?.name || e.teamId,
                type: e.type,
              });
            } else if (e.type === 'goal') {
              const a = e.assistPlayerId ? team?.players?.find((pp) => pp.id === e.assistPlayerId) : null;
              const penTag = e.penalty ? ' (Pen)' : '';
              const assistTag = a ? ` (🅰️ ${a.name})` : '';
              const str = (p ? p.name : 'Goal') + penTag + assistTag;
              if (e.teamId === f.home) homeScorers.push(str);
              else if (e.teamId === f.away) awayScorers.push(str);
            } else if (e.type === 'owngoal') {
              const str = (p ? p.name : 'Player') + ' (OG)';
              if (e.teamId === f.home) awayScorers.push(str);
              else if (e.teamId === f.away) homeScorers.push(str);
            }
          });

          const refOptions = Array.from(
            new Set([...(referees || []), ...(f.referee ? [f.referee] : [])])
          );

          // Non-playing teams for interference bookings
          const otherTeams = teamsList.filter((t) => t.id !== f.home && t.id !== f.away);
          const currentInterfDraft = interfDrafts[f.id] || { teamId: '', playerId: '', type: 'yellow' };
          const selectedOtherTeam = teamsById[currentInterfDraft.teamId];

          return (
            <div
              key={f.id}
              className="fixture-card"
              style={{
                padding: '14px 16px',
                background: '#0A241C',
                border: isCompleted ? '1px solid #1E4636' : '1px dashed #2B5746',
                borderRadius: '12px',
              }}
            >
              {/* Top Meta Line: Date, Status Pill, Referee, Move Day */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {isCmsMode && !isCompleted && (
                    <input
                      type="checkbox"
                      checked={Boolean(selectedForMove[f.id])}
                      onChange={() => handleToggleSelectFixtureForMove(f.id)}
                      style={{ accentColor: '#C9A227', width: '16px', height: '16px', cursor: 'pointer' }}
                      title="Select fixture to move to another day"
                    />
                  )}
                  <span style={{ fontSize: '11.5px', color: '#8FA89B', fontWeight: 600 }}>
                    📅 {f.date || 'Date TBD'}
                  </span>
                  <span style={{ fontSize: '11.5px', color: '#8FA89B', fontWeight: 600 }}>
                    📍 {f.venue || schedule?.venue || 'Thoome Pri.'}
                  </span>
                  {f.is_rescheduled && (
                    <span
                      style={{
                        background: 'rgba(201, 162, 39, 0.2)',
                        border: '1px solid #C9A227',
                        color: '#FDE047',
                        fontSize: '9.5px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                      }}
                    >
                      🗓️ MOVED
                    </span>
                  )}
                  {isCmsMode && !isCompleted && onMoveFixture && (
                    <button
                      type="button"
                      onClick={() => {
                        setMovingFixtureId(movingFixtureId === f.id ? null : f.id);
                        setMoveDateInput('');
                      }}
                      style={{
                        background: movingFixtureId === f.id ? '#C9A227' : '#16352A',
                        color: movingFixtureId === f.id ? '#16201B' : '#DDE6DF',
                        border: '1px solid #2B5746',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      title="Move this match to another date and time"
                    >
                      🗓️ Move Date
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      letterSpacing: '0.06em',
                      background: isCompleted ? 'rgba(34, 197, 94, 0.16)' : 'rgba(201, 162, 39, 0.16)',
                      color: isCompleted ? '#4ADE80' : '#C9A227',
                      border: isCompleted ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(201, 162, 39, 0.4)',
                    }}
                  >
                    {f.walkover ? 'WALKOVER (3-0)' : isCompleted ? 'FULL TIME RESULT' : (f.events && f.events.length > 0) ? 'MATCH IN PROGRESS / LOGGED' : 'UPCOMING FIXTURE'}
                  </span>

                  {/* Referee display or selector (Admin can change referee for any unplayed fixture) */}
                  {isCmsMode && !isCompleted ? (
                    <span style={{ fontSize: '11.5px', color: '#8FA89B', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span>🧑‍⚖️ Ref:</span>
                      <select
                        value={f.referee || ''}
                        onChange={(e) => onSetReferee(f.id, e.target.value)}
                        aria-label={`Change referee for unplayed fixture ${f.id}`}
                        style={{
                          background: '#16352A',
                          border: '1px solid #C9A227',
                          borderRadius: '6px',
                          color: '#C9A227',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">Assign / Change Referee…</option>
                        {refOptions.map((r, i) => (
                          <option key={i} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </span>
                  ) : (
                    (f.referee || isCmsMode) && (
                      <span
                        style={{ fontSize: '11px', color: '#8FA89B' }}
                        title={isCompleted ? 'Fixture already played (unmark Final to change referee)' : ''}
                      >
                        🧑‍⚖️ Ref: <strong style={{ color: '#DDE6DF' }}>{f.referee || 'Unassigned'}</strong>
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Inline Single Fixture Reschedule Panel */}
              {isCmsMode && movingFixtureId === f.id && (
                <div
                  className="reschedule-panel"
                  style={{
                    background: '#08231B',
                    border: '1px solid #C9A227',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#C9A227' }}>
                      🗓️ Reschedule Match &ldquo;{home?.name} vs {away?.name}&rdquo;
                    </span>
                    <button
                      type="button"
                      onClick={() => setMovingFixtureId(null)}
                      style={{ background: 'transparent', border: 'none', color: '#8FA89B', cursor: 'pointer', fontSize: '12px' }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10.5px', color: '#8FA89B', marginBottom: '2px' }}>
                        Choose New Date:
                      </label>
                      <input
                        type="date"
                        className="form-input"
                        value={moveDateInput}
                        onChange={(e) => setMoveDateInput(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '12px', width: '150px' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10.5px', color: '#8FA89B', marginBottom: '2px' }}>
                        Kickoff Time:
                      </label>
                      <input
                        type="time"
                        className="form-input"
                        value={moveTimeInput}
                        onChange={(e) => setMoveTimeInput(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '12px', width: '110px' }}
                        required
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConfirmSingleMove(f.id)}
                      disabled={!moveDateInput}
                      style={{
                        background: moveDateInput ? '#C9A227' : '#16352A',
                        color: moveDateInput ? '#16201B' : '#8FA89B',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 14px',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: moveDateInput ? 'pointer' : 'not-allowed',
                      }}
                    >
                      ✅ Apply Move
                    </button>
                  </div>
                </div>
              )}

              {/* Scoreboard Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: home?.color || '#C9A227', flexShrink: 0 }} />
                  {onSelectTeam && f.home ? (
                    <button
                      type="button"
                      className="team-link-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTeam(f.home, activeCategoryKey);
                      }}
                      style={{ fontWeight: 800, color: '#F4F2EA', fontSize: '15px' }}
                      title={`Click to view ${home?.name || f.home} profile, statistics & odds`}
                    >
                      {home?.name || 'TBD'}
                    </button>
                  ) : (
                    <span style={{ fontWeight: 800, color: '#F4F2EA', fontSize: '15px' }}>{home?.name || 'TBD'}</span>
                  )}
                </div>

                <div
                  className="scoreboard"
                  style={{
                    fontSize: '26px',
                    color: isCompleted ? '#C9A227' : '#8FA89B',
                    padding: '4px 16px',
                    background: '#0F2E24',
                    borderRadius: '8px',
                    border: '1px solid #1E4636',
                    letterSpacing: '0.08em',
                    minWidth: '88px',
                    textAlign: 'center',
                  }}
                >
                  {isCompleted || (f.events && f.events.length > 0) ? `${hs} - ${as}` : 'VS'}
                </div>

                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', textAlign: 'right' }}>
                  {onSelectTeam && f.away ? (
                    <button
                      type="button"
                      className="team-link-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTeam(f.away, activeCategoryKey);
                      }}
                      style={{ fontWeight: 800, color: '#F4F2EA', fontSize: '15px' }}
                      title={`Click to view ${away?.name || f.away} profile, statistics & odds`}
                    >
                      {away?.name || 'TBD'}
                    </button>
                  ) : (
                    <span style={{ fontWeight: 800, color: '#F4F2EA', fontSize: '15px' }}>{away?.name || 'TBD'}</span>
                  )}
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: away?.color || '#2E5A8F', flexShrink: 0 }} />
                </div>
              </div>

              {/* Scorers Summary */}
              {(homeScorers.length > 0 || awayScorers.length > 0) && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11.5px',
                    color: '#9BB5A8',
                    padding: '6px 8px 2px',
                    borderTop: '1px solid rgba(30, 70, 54, 0.5)',
                    marginTop: '6px',
                    gap: '12px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {homeScorers.map((s, idx) => (
                      <span key={idx} style={{ display: 'inline-block', marginRight: '8px' }}>
                        ⚽ {s}
                      </span>
                    ))}
                  </div>
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    {awayScorers.map((s, idx) => (
                      <span key={idx} style={{ display: 'inline-block', marginLeft: '8px' }}>
                        ⚽ {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Interference Bookings in this match */}
              {interferenceEvents.length > 0 && (
                <div style={{ marginTop: '6px', padding: '4px 8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', fontSize: '11px', color: '#FCD34D' }}>
                  🚨 <strong>Sideline Interference Bookings:</strong>{' '}
                  {interferenceEvents.map((ev, i) => (
                    <span key={i} style={{ marginRight: '8px' }}>
                      {ev.type === 'red' ? '🟥' : '🟨'} {ev.player} ({ev.teamName}) — takes effect in their team&apos;s next match
                    </span>
                  ))}
                </div>
              )}

              {/* Suspensions Line */}
              {suspendedList.length > 0 && (
                <div style={{ textAlign: 'center', fontSize: '11.5px', color: '#FF8A80', background: 'rgba(226, 74, 59, 0.12)', border: '1px solid rgba(226, 74, 59, 0.35)', borderRadius: '6px', padding: '5px 10px', marginTop: '6px' }}>
                  🚫 <strong>Suspended (Misses Match):</strong>{' '}
                  {suspendedList.map((s) => `${s.playerName} (${teamsById[s.teamId]?.name || s.teamId} — ${s.reason})`).join(' · ')}
                </div>
              )}

              {/* Action Buttons: H2H & Match Sheet (Public) + CMS Controls (CMS Mode) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {home && away && (
                    <button
                      type="button"
                      className="btn-pill-action"
                      onClick={() => onOpenH2H(home.id, away.id)}
                      title="Head-to-head record and recent form comparison"
                    >
                      ⚔️ Head-to-Head
                    </button>
                  )}

                  <a
                    href={`/fixtures/${f.id}/sheet/`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-pill-action"
                    title="Official Printable Match Day Team Sheet"
                  >
                    📄 Match Sheet
                  </a>
                </div>

                {isCmsMode && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="played-toggle"
                      onClick={() => onTogglePlayed(f.id)}
                      style={{
                        background: f.played ? 'rgba(201,162,39,0.15)' : 'transparent',
                        borderColor: f.played ? '#C9A227' : '#2B4E40',
                        color: f.played ? '#C9A227' : '#8FA89B',
                        padding: '4px 10px',
                        fontSize: '11.5px',
                      }}
                    >
                      {f.played ? '✓ Final' : 'Mark Final'}
                    </button>

                    <button
                      type="button"
                      className="btn-pill-action"
                      onClick={() => toggleOpen(f.id)}
                    >
                      {isOpen ? 'Hide CMS Events ▲' : '✏️ Record Match Events ▾'}
                    </button>
                  </div>
                )}
              </div>

              {/* Expandable CMS Match Events Panel */}
              {isCmsMode && isOpen && (
                <div style={{ marginTop: '12px', background: '#082820', borderRadius: '8px', padding: '12px', border: '1px solid #1E4636' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#C9A227', marginBottom: '8px' }}>
                    CMS: RECORD MATCH EVENTS (GOALS WITH ASSISTS / PENALTY / OWN GOAL &amp; CARDS)
                  </div>

                  {/* Existing event chips */}
                  <div style={{ marginBottom: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(f.events || []).map((e, idx) => {
                      const t = teamsById[e.teamId];
                      const p = t?.players?.find((pp) => pp.id === e.playerId);
                      const a = e.assistPlayerId ? t?.players?.find((pp) => pp.id === e.assistPlayerId) : null;
                      const isInterf = Boolean(
                        e.interference || (f.home && f.away && e.teamId !== f.home && e.teamId !== f.away)
                      );
                      let label = `${p ? p.name : 'Unknown'} (${t?.name || e.teamId})`;
                      if (e.type === 'goal') {
                        if (e.penalty) label += ' [Penalty Goal]';
                        if (a) label += ` [🅰️ Assist: ${a.name}]`;
                      } else if (e.type === 'owngoal') {
                        label += ' [Own Goal]';
                      } else if (isInterf) {
                        label += ' [🚨 INTERFERENCE]';
                      }

                      return (
                        <span key={idx} className="ev-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span>{e.type === 'goal' ? (e.penalty ? '🎯⚽' : '⚽') : e.type === 'owngoal' ? '🥅' : e.type === 'yellow' ? '🟨' : '🟥'}</span>
                          <span>{label}</span>
                          <span
                            className="ev-remove"
                            onClick={() => {
                              setRecentlyEditedIds((prev) => ({ ...prev, [f.id]: true }));
                              onRemoveEvent(f.id, idx);
                            }}
                            title="Delete event"
                          >
                            ✕
                          </span>
                        </span>
                      );
                    })}
                    {(!f.events || f.events.length === 0) && (
                      <span style={{ fontSize: '11px', color: '#6E9080' }}>No events logged yet.</span>
                    )}
                  </div>

                  {/* Playing Teams: Comprehensive Goal & Card Recorders */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                    {[home, away].filter(Boolean).map((team) => {
                      const tDraft = goalDrafts[f.id]?.[team.id] || { playerId: '', type: 'goal', assistPlayerId: '' };
                      const teamPlayers = team.players || [];
                      const assistCandidates = teamPlayers.filter((p) => p.id !== tDraft.playerId && !p.unknown);

                      return (
                        <div key={team.id} style={{ background: '#0F2E24', padding: '10px', borderRadius: '8px', border: '1px solid #163E30' }}>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#C9A227', marginBottom: '6px' }}>
                            {team.name} ({team.id})
                          </div>

                          {/* Goal recording form */}
                          <div style={{ background: '#0A241C', padding: '8px', borderRadius: '6px', marginBottom: '8px' }}>
                            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#8FA89B', marginBottom: '4px' }}>
                              ⚽ RECORD GOAL (REGULAR / PENALTY / OWN GOAL + ASSIST):
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {/* Scorer */}
                              <select
                                className="form-input"
                                style={{ fontSize: '11.5px', padding: '4px 6px' }}
                                value={tDraft.playerId}
                                onChange={(e) => updateGoalDraft(f.id, team.id, 'playerId', e.target.value)}
                              >
                                <option value="">Select Scorer…</option>
                                {teamPlayers.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} {p.position ? `(${p.position})` : ''}
                                  </option>
                                ))}
                              </select>

                              {/* Goal Type */}
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <select
                                  className="form-input"
                                  style={{ fontSize: '11px', padding: '4px', flex: 1 }}
                                  value={tDraft.type}
                                  onChange={(e) => updateGoalDraft(f.id, team.id, 'type', e.target.value)}
                                >
                                  <option value="goal">⚽ Regular Goal</option>
                                  <option value="penalty">🎯 Penalty Goal</option>
                                  <option value="owngoal">🥅 Own Goal</option>
                                </select>

                                {/* Assist Player (Optional on Regular Goal) */}
                                {tDraft.type === 'goal' && (
                                  <select
                                    className="form-input"
                                    style={{ fontSize: '11px', padding: '4px', flex: 1 }}
                                    value={tDraft.assistPlayerId}
                                    onChange={(e) => updateGoalDraft(f.id, team.id, 'assistPlayerId', e.target.value)}
                                  >
                                    <option value="">🅰️ Assist: Unassisted</option>
                                    {assistCandidates.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        Assist: {p.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRecordGoal(f.id, team.id)}
                                disabled={!tDraft.playerId}
                                style={{
                                  background: tDraft.playerId ? '#C9A227' : '#1B3D30',
                                  color: tDraft.playerId ? '#16201B' : '#5C7A6D',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '5px 10px',
                                  fontSize: '11.5px',
                                  fontWeight: 800,
                                  cursor: tDraft.playerId ? 'pointer' : 'not-allowed',
                                  marginTop: '2px',
                                }}
                              >
                                + Record Goal
                              </button>
                            </div>
                          </div>

                          {/* Quick Cards for playing team */}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <select
                              className="form-input"
                              style={{ fontSize: '11px', padding: '3px', flex: 1 }}
                              onChange={(e) => {
                                const pId = e.target.value;
                                if (!pId) return;
                                setRecentlyEditedIds((prev) => ({ ...prev, [f.id]: true }));
                                setOpenFixtureIds((prev) => ({ ...prev, [f.id]: true }));
                                onAddEvent(f.id, { teamId: team.id, playerId: pId, type: 'yellow' });
                                e.target.value = '';
                              }}
                            >
                              <option value="">+ 🟨 Yellow Card</option>
                              {teamPlayers.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>

                            <select
                              className="form-input"
                              style={{ fontSize: '11px', padding: '3px', flex: 1 }}
                              onChange={(e) => {
                                const pId = e.target.value;
                                if (!pId) return;
                                setRecentlyEditedIds((prev) => ({ ...prev, [f.id]: true }));
                                setOpenFixtureIds((prev) => ({ ...prev, [f.id]: true }));
                                onAddEvent(f.id, { teamId: team.id, playerId: pId, type: 'red' });
                                e.target.value = '';
                              }}
                            >
                              <option value="">+ 🟥 Red Card</option>
                              {teamPlayers.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* NON-PLAYING TEAM PLAYER INTERFERENCE BOOKING */}
                  {otherTeams.length > 0 && (
                    <div style={{ marginTop: '12px', background: '#092119', border: '1px solid #D97706', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#F59E0B', textTransform: 'uppercase', marginBottom: '6px' }}>
                        🚨 Book Non-Playing Team Player for Sideline Interference (Takes effect in their team&apos;s next match)
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        {/* Select other team */}
                        <select
                          className="form-input"
                          style={{ fontSize: '11.5px', padding: '4px 8px', flex: '1 1 140px' }}
                          value={currentInterfDraft.teamId}
                          onChange={(e) => updateInterfDraft(f.id, 'teamId', e.target.value)}
                        >
                          <option value="">Select Non-Playing Team…</option>
                          {otherTeams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>

                        {/* Select player from other team */}
                        <select
                          className="form-input"
                          style={{ fontSize: '11.5px', padding: '4px 8px', flex: '1 1 160px' }}
                          value={currentInterfDraft.playerId}
                          disabled={!selectedOtherTeam}
                          onChange={(e) => updateInterfDraft(f.id, 'playerId', e.target.value)}
                        >
                          <option value="">Select Offending Player…</option>
                          {(selectedOtherTeam?.players || []).map((p) => (
                            <option key={p.id} value={p.id}>{p.name} {p.position ? `(${p.position})` : ''}</option>
                          ))}
                        </select>

                        {/* Card type */}
                        <select
                          className="form-input"
                          style={{ fontSize: '11.5px', padding: '4px 8px', width: '130px' }}
                          value={currentInterfDraft.type}
                          onChange={(e) => updateInterfDraft(f.id, 'type', e.target.value)}
                        >
                          <option value="yellow">🟨 Yellow Card</option>
                          <option value="red">🟥 Red Card</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleRecordInterference(f.id)}
                          disabled={!currentInterfDraft.teamId || !currentInterfDraft.playerId}
                          style={{
                            background: currentInterfDraft.teamId && currentInterfDraft.playerId ? '#D97706' : '#2D2817',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: currentInterfDraft.teamId && currentInterfDraft.playerId ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Book for Interference
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Walkover choice */}
                  <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#8FA89B' }}>
                    Walkover winner:{' '}
                    <button
                      type="button"
                      className="stat-btn"
                      style={{ background: f.walkover === f.home ? '#C9A227' : '#16352A', color: f.walkover === f.home ? '#16201B' : '#DDE6DF' }}
                      onClick={() => onSetWalkover(f.id, f.walkover === f.home ? null : f.home)}
                    >
                      {home?.name || 'Home'} (3-0)
                    </button>{' '}
                    <button
                      type="button"
                      className="stat-btn"
                      style={{ background: f.walkover === f.away ? '#C9A227' : '#16352A', color: f.walkover === f.away ? '#16201B' : '#DDE6DF' }}
                      onClick={() => onSetWalkover(f.id, f.walkover === f.away ? null : f.away)}
                    >
                      {away?.name || 'Away'} (3-0)
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
