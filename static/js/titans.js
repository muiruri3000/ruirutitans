(function () {
"use strict";

/* ---------- Design tokens ----------
Palette: pitch (#0B3A2E), floodlight (#F4F2EA), gold (#C9A227), ember (#B23A2E), ink (#16201B), mist (#8FA89B)
Display face: 'Bebas Neue' — body: 'Inter'
The draw is not fixed at any size — group count and knockout bracket size both scale with
however many teams a category actually has (add a team under Manage and the whole shape adjusts).
This logic (chooseGroupCount / regenerateGroups / buildKnockout / propagateRounds / tieResult)
is unchanged from the original design — everything else layered on top of it.
------------------------------------- */

// ---------- tiny DOM helper (no JSX, no build step, no in-browser compiler) ----------
function el(tag, props, children) {
  const node = document.createElement(tag);
  props = props || {};
  Object.keys(props).forEach((key) => {
    const val = props[key];
    if (val === null || val === undefined || val === false) return;
    if (key === "style" && typeof val === "object") {
      Object.assign(node.style, val);
    } else if (key === "className") {
      node.className = val;
    } else if (key.startsWith("on") && typeof val === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === "value") {
      node.value = val;
    } else if (val === true) {
      node.setAttribute(key, "");
    } else {
      node.setAttribute(key, val);
    }
  });
  (children || []).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) {
      c.forEach((cc) => cc != null && cc !== false && node.appendChild(cc instanceof Node ? cc : document.createTextNode(cc)));
    } else {
      node.appendChild(c instanceof Node ? c : document.createTextNode(c));
    }
  });
  return node;
}

const EVENT_TYPES = [
  { key: "goal", label: "Goal", icon: "⚽" },
  { key: "owngoal", label: "Own Goal", icon: "OG" },
  { key: "assist", label: "Assist", icon: "🅰️" },
  { key: "yellow", label: "Yellow", icon: "🟨" },
  { key: "red", label: "Red", icon: "🟥" },
];

const POSITIONS = [
  { value: "", label: "No position set" },
  { value: "GK", label: "Goalkeeper (GK)" },
  { value: "DEF", label: "Defender (DEF)" },
  { value: "MID", label: "Midfielder (MID)" },
  { value: "FWD", label: "Forward (FWD)" },
];
function posLabel(p) { return p && p.position ? " (" + p.position + ")" : ""; }

const PALETTE = ["#B23A2E", "#C9A227", "#2E5A8F", "#3F7A4E", "#7A3F8F", "#D97B29", "#1F6E5C", "#8F2E5A", "#4E4E4E", "#2E7A7A", "#A2451F", "#3F5A2E", "#5A2E7A", "#7A5A2E", "#2E4E7A", "#7A2E3F"];
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const CLUB_LOGO_SRC = window.CLUB_LOGO_URL || "/static/images/club-logo.jpg";

// Default schedule for a brand-new category — Wed/Thu/Fri/Sat, one match each at 6:00
// PM — used until the person sets their own match time, days, and per-day match count
// in Manage. `days` maps weekday (0=Sun..6=Sat) to how many matches that day hosts;
// a day absent or set to 0 doesn't host matches at all.
const DEFAULT_SCHEDULE = { time: "18:00", days: { 3: 1, 4: 1, 5: 1, 6: 1 } };

function emptyCategory(label, mode, format) {
  const schedule = { time: DEFAULT_SCHEDULE.time, days: Object.assign({}, DEFAULT_SCHEDULE.days) };
  if (mode === "league") return { label: label, mode: "league", format: format === "single" ? "single" : "double", teams: [], fixtures: [], schedule: schedule, referees: [] };
  return { label: label, mode: "cup", teams: [], groupLetters: [], groupOf: {}, groupFixtures: {}, rounds: null, schedule: schedule, referees: [] };
}

// League mode: flat round robin across every team (no groups, no knockout).
// "double": every pair plays twice (home & away swapped). "single": once each.

// ============================================================
// HEAD-TO-HEAD (H2H) & FORM MODAL
// ============================================================

let activeH2HData = null;
let loadingH2H = false;

function closeH2HModal() {
  activeH2HData = null;
  loadingH2H = false;
  const existing = document.getElementById("h2h-modal-overlay");
  if (existing) existing.remove();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeH2HModal();
});

async function openH2HModal(team1Id, team2Id) {
  if (!team1Id || !team2Id) return;
  const catKey = state.data.activeCategory;
  loadingH2H = true;
  activeH2HData = null;
  renderH2HModal(team1Id, team2Id);

  try {
    const res = await fetch("/api/categories/" + catKey + "/h2h/?team1=" + encodeURIComponent(team1Id) + "&team2=" + encodeURIComponent(team2Id));
    if (res.ok) {
      activeH2HData = await res.json();
    } else {
      activeH2HData = { error: "Could not load H2H comparison." };
    }
  } catch (err) {
    activeH2HData = { error: "Network error loading H2H data." };
  }
  loadingH2H = false;
  renderH2HModal(team1Id, team2Id);
}

function renderH2HModal(team1Id, team2Id) {
  let overlay = document.getElementById("h2h-modal-overlay");
  if (!overlay) {
    overlay = el("div", {
      id: "h2h-modal-overlay",
      className: "h2h-overlay",
      onclick: (e) => {
        if (e.target.id === "h2h-modal-overlay") closeH2HModal();
      },
    });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = "";

  const closeBtn = el("button", {
    style: {
      background: "none",
      border: "none",
      color: "#8FA89B",
      fontSize: "20px",
      cursor: "pointer",
      padding: "4px 8px",
      borderRadius: "4px",
    },
    onclick: closeH2HModal,
  }, ["✕"]);

  const header = el("div", {
    style: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1E4636", paddingBottom: "12px", marginBottom: "16px" }
  }, [
    el("div", {}, [
      el("div", { style: { color: "#C9A227", fontSize: "11px", fontWeight: "700", letterSpacing: "0.15em", textTransform: "uppercase" } }, ["MATCH PREVIEW"]),
      el("h2", { className: "scoreboard", style: { margin: "2px 0 0", fontSize: "24px", color: "#F4F2EA" } }, ["HEAD-TO-HEAD & RECENT FORM"]),
    ]),
    closeBtn
  ]);

  let body;
  if (loadingH2H) {
    body = el("div", { style: { textAlign: "center", padding: "40px 0", color: "#8FA89B" } }, [
      el("div", { style: { fontSize: "28px", marginBottom: "8px" } }, ["⚔️"]),
      el("div", { style: { fontSize: "13px" } }, ["Analyzing clash history and form statistics…"]),
    ]);
  } else if (!activeH2HData || activeH2HData.error) {
    body = el("div", { style: { textAlign: "center", padding: "30px", color: "#EF4444" } }, [
      el("div", {}, [activeH2HData ? activeH2HData.error : "Failed to load comparison."]),
    ]);
  } else {
    const d = activeH2HData;
    const t1 = d.team1;
    const t2 = d.team2;
    const sum = d.h2h_summary;

    const clashBanner = el("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#082820",
        border: "1px solid #1E4636",
        borderRadius: "10px",
        padding: "16px 20px",
        marginBottom: "18px",
      }
    }, [
      el("div", { style: { textAlign: "center", flex: "1" } }, [
        el("div", { style: { width: "16px", height: "16px", borderRadius: "50", background: t1.color, margin: "0 auto 6px" } }),
        el("div", { className: "scoreboard", style: { fontSize: "22px", color: "#F4F2EA" } }, [t1.name]),
        el("div", { style: { fontSize: "11.5px", color: "#8FA89B" } }, [t1.points + " pts · W" + t1.won + " D" + t1.drawn + " L" + t1.lost]),
      ]),
      el("div", { style: { textAlign: "center", padding: "0 16px" } }, [
        el("div", { className: "scoreboard", style: { fontSize: "28px", color: "#C9A227", lineHeight: "1" } }, [
          sum.team1_wins + " - " + sum.draws + " - " + sum.team2_wins
        ]),
        el("div", { style: { fontSize: "10px", color: "#8FA89B", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "4px" } }, [
          sum.total_matches + " previous match" + (sum.total_matches === 1 ? "" : "es")
        ]),
      ]),
      el("div", { style: { textAlign: "center", flex: "1" } }, [
        el("div", { style: { width: "16px", height: "16px", borderRadius: "50%", background: t2.color, margin: "0 auto 6px" } }),
        el("div", { className: "scoreboard", style: { fontSize: "22px", color: "#F4F2EA" } }, [t2.name]),
        el("div", { style: { fontSize: "11.5px", color: "#8FA89B" } }, [t2.points + " pts · W" + t2.won + " D" + t2.drawn + " L" + t2.lost]),
      ]),
    ]);

    const renderFormBadges = (formList) => {
      if (!formList || formList.length === 0) {
        return el("div", { style: { fontSize: "12px", color: "#6E9080", fontStyle: "italic" } }, ["No matches played yet"]);
      }
      return el("div", { style: { display: "flex", gap: "6px", alignItems: "center" } },
        formList.map((m) => el("span", {
          className: "form-badge " + m.result,
          title: m.date + ": vs " + m.opponent_name + " (" + m.score + ")",
        }, [m.result]))
      );
    };

    const formSection = el("div", {
      style: {
        background: "#082820",
        border: "1px solid #1E4636",
        borderRadius: "10px",
        padding: "14px 16px",
        marginBottom: "18px",
      }
    }, [
      el("div", { style: { fontSize: "12px", fontWeight: "700", color: "#C9A227", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" } }, ["Recent Form (Last 5 Matches)"]),
      el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", paddingBottom: "8px", borderBottom: "1px solid #16352A" } }, [
        el("span", { style: { fontSize: "13px", fontWeight: "600", color: "#DDE6DF" } }, [t1.name]),
        renderFormBadges(d.team1_form),
      ]),
      el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, [
        el("span", { style: { fontSize: "13px", fontWeight: "600", color: "#DDE6DF" } }, [t2.name]),
        renderFormBadges(d.team2_form),
      ]),
    ]);

    const metricRow = (label, val1, val2) => el("div", {
      style: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #16352A", fontSize: "12.5px" }
    }, [
      el("span", { style: { fontWeight: "700", color: "#F4F2EA", width: "40px" } }, [String(val1)]),
      el("span", { style: { color: "#8FA89B", textAlign: "center", flex: "1" } }, [label]),
      el("span", { style: { fontWeight: "700", color: "#F4F2EA", width: "40px", textAlign: "right" } }, [String(val2)]),
    ]);

    const statsComparison = el("div", {
      style: {
        background: "#082820",
        border: "1px solid #1E4636",
        borderRadius: "10px",
        padding: "14px 16px",
        marginBottom: "18px",
      }
    }, [
      el("div", { style: { fontSize: "12px", fontWeight: "700", color: "#C9A227", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" } }, ["Season Comparative Metrics"]),
      metricRow("Goals Scored", t1.goals_for, t2.goals_for),
      metricRow("Goals Conceded", t1.goals_against, t2.goals_against),
      metricRow("Avg Goals / Match", t1.avg_goals, t2.avg_goals),
      metricRow("Clean Sheets", t1.clean_sheets, t2.clean_sheets),
      metricRow("Yellow Cards", t1.yellow_cards, t2.yellow_cards),
      metricRow("Red Cards", t1.red_cards, t2.red_cards),
    ]);

    const pastEncountersList = (d.past_matches && d.past_matches.length > 0)
      ? d.past_matches.map((m) => el("div", {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 10px",
            borderBottom: "1px solid #16352A",
            fontSize: "12px",
          }
        }, [
          el("span", { style: { color: "#8FA89B", width: "60px" } }, [m.date]),
          el("span", { style: { fontWeight: m.home_id === t1.id ? "700" : "400", color: m.home_id === t1.id ? "#C9A227" : "#DDE6DF" } }, [m.home_name]),
          el("span", { className: "scoreboard", style: { fontSize: "16px", color: "#F4F2EA", padding: "0 8px" } }, [
            m.played ? (m.home_score + " – " + m.away_score) : "vs"
          ]),
          el("span", { style: { fontWeight: m.away_id === t1.id ? "700" : "400", color: m.away_id === t1.id ? "#C9A227" : "#DDE6DF" } }, [m.away_name]),
        ]))
      : el("div", { style: { padding: "12px", fontSize: "12px", color: "#6E9080", textAlign: "center", fontStyle: "italic" } }, [
          "No previous meetings between these two teams on record."
        ]);

    const pastSection = el("div", {
      style: {
        background: "#082820",
        border: "1px solid #1E4636",
        borderRadius: "10px",
        padding: "14px 16px",
      }
    }, [
      el("div", { style: { fontSize: "12px", fontWeight: "700", color: "#C9A227", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" } }, ["Previous Meetings"]),
      pastEncountersList
    ]);

    body = el("div", {}, [clashBanner, formSection, statsComparison, pastSection]);
  }

  const modalBox = el("div", { className: "h2h-modal" }, [header, body]);
  overlay.appendChild(modalBox);
}

// ============================================================
// FIXTURE SCHEDULING — each category has its own schedule (cat.schedule: a kickoff time,
// and a per-weekday match count), set in Manage. Dates are assigned automatically to any
// newly created, not-yet-played fixture still marked "TBD" — anything already dated
// (including historical results) or already played is left exactly as it is, and each new
// round of scheduling picks up after the latest date already assigned rather than
// restarting from today.
// ============================================================
// Accepts either the current {weekday: count} map, or the older plain array of enabled
// weekdays (each implicitly 1 match) from before per-day counts existed.
function normalizeDayCounts(days) {
  if (Array.isArray(days) && days.length) {
    const obj = {};
    days.forEach((d) => { obj[d] = 1; });
    return obj;
  }
  if (days && typeof days === "object" && Object.keys(days).length) return days;
  return DEFAULT_SCHEDULE.days;
}

// Turns a category's {days, time} into the weekday/hour/minute slot list the scheduler
// walks — multiple matches on the same day are spaced an hour apart starting at the
// chosen time. Falls back to the default Wed–Sat 6PM pattern for older categories with
// no schedule set yet.
function buildSchedulePattern(schedule) {
  const dayCounts = normalizeDayCounts(schedule && schedule.days);
  const timeStr = (schedule && schedule.time) || DEFAULT_SCHEDULE.time;
  const parts = String(timeStr).split(":");
  const hh = Math.max(0, Math.min(23, parseInt(parts[0], 10) || 0));
  const mm = Math.max(0, Math.min(59, parseInt(parts[1], 10) || 0));
  const pattern = [];
  Object.keys(dayCounts).map(Number).sort((a, b) => a - b).forEach((d) => {
    const count = Math.max(0, Math.min(10, Number(dayCounts[d]) || 0));
    for (let k = 0; k < count; k++) {
      // same-day matches are spaced an hour apart, clamped so they never roll into the next day
      const totalMinutes = Math.min(23 * 60 + 59, hh * 60 + mm + k * 60);
      pattern.push({ weekday: d, hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 });
    }
  });
  return pattern;
}

function formatFixtureDate(raw) {
  if (!raw || raw === "TBD") return "TBD";
  // Only reformat the full ISO timestamps this scheduler generates itself — a plain
  // label like "Aug 1" (from historical data) is shown exactly as entered, with no
  // invented time of day tacked on.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  const mm = m < 10 ? "0" + m : "" + m;
  return days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate() + " \u00B7 " + h + ":" + mm + " " + ampm;
}

// First pattern slot strictly after `afterDate`.
function nextScheduleSlot(afterDate, pattern) {
  const day = new Date(afterDate);
  day.setHours(0, 0, 0, 0);
  for (let step = 0; step < 60; step++) {
    const dow = day.getDay();
    const slots = pattern.filter((s) => s.weekday === dow).sort((a, b) => a.hour - b.hour || a.minute - b.minute);
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k];
      const candidate = new Date(day);
      candidate.setHours(s.hour, s.minute, 0, 0);
      if (candidate.getTime() > afterDate.getTime()) return candidate;
    }
    day.setDate(day.getDate() + 1);
  }
  return new Date(afterDate);
}

// Compares two fixtures by effective date — parseable dates (scheduled ISO slots or
// plain historical labels like "Aug 1") sort chronologically; "TBD"/unparseable ones sort last.
function compareFixtureDates(a, b) {
  const da = new Date(a.date), db = new Date(b.date);
  const va = isNaN(da.getTime()) ? Infinity : da.getTime();
  const vb = isNaN(db.getTime()) ? Infinity : db.getTime();
  return va - vb;
}
function sortFixturesByDate(list) { return (list || []).slice().sort(compareFixtureDates); }

// Schedules a list of fixtures, giving priority to any fixture where a team hasn't
// played a match yet in this list (so a team added mid-season gets its fixtures dated
// sooner) ahead of fixtures purely between teams who've already played. Only already-
// played fixtures are left untouched — every unplayed fixture is freely recomputed each
// time so priority and leg ordering hold up as the roster changes. Returns the list
// sorted chronologically, so the fixture list itself reads in the order matches will
// actually happen.
//
// `legOf(fixture)` is optional: when given (double round-robin), it returns 1 for a
// first-leg fixture or 2 for its return leg, and every leg-2 fixture is scheduled to
// start only after every leg-1 fixture — the whole first round of the competition
// completes before any return leg is played.
// Calendar-day key, so "same day" can be checked regardless of kickoff time.
function dateKey(d) { return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
// Unordered pair key — a fixture and its reverse (home/away swapped) share this key,
// so the two legs of a double round robin can be kept off the same calendar day.
function fixturePairKey(f) { return f.home < f.away ? f.home + "|" + f.away : f.away + "|" + f.home; }

function scheduleFixturesByPriority(fixtureList, legOf, pattern) {
  const slotPattern = pattern || buildSchedulePattern(null);
  // heal any fixture that's played but still stuck on "TBD"/no date (e.g. marked
  // final before this scheduler existed) — a played match should never show "TBD"
  const list = (fixtureList || []).map((f) => (f.played && (!f.date || f.date === "TBD"))
    ? Object.assign({}, f, { date: new Date().toISOString() })
    : f);
  const hasPlayed = {};
  list.forEach((f) => { if (f.played) { hasPlayed[f.home] = true; hasPlayed[f.away] = true; } });
  const leg = legOf || (() => 1);

  // Only a fixture that's already been played is locked in place — an unplayed fixture's
  // date is just a plan, so it's always free to be recomputed as the roster changes,
  // which is what lets leg-1/leg-2 ordering (and new-team priority) hold up globally
  // rather than only within whichever fixtures were introduced in one batch.
  const alreadySet = [];
  const toSchedule = [];
  list.forEach((f) => {
    if (f.played) alreadySet.push(f); else toSchedule.push(f);
  });

  // higher score = more not-yet-played teams involved = scheduled sooner; ties keep
  // their original relative (round-robin draw) order
  const freshness = (f) => (hasPlayed[f.home] ? 0 : 1) + (hasPlayed[f.away] ? 0 : 1);
  const orderWithin = (subset) => subset
    .map((f, idx) => ({ f: f, idx: idx, score: freshness(f) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((x) => x.f);
  const leg1Ordered = orderWithin(toSchedule.filter((f) => leg(f) === 1));
  const leg2Ordered = orderWithin(toSchedule.filter((f) => leg(f) === 2));

  let cursor = new Date();
  // seed which days each pair already occupies, and how far leg-1 already extends,
  // from fixtures that are already dated/played
  const daysUsedByPair = {};
  let leg1Frontier = null; // latest known leg-1 date — no leg-2 fixture may start before this
  alreadySet.forEach((f) => {
    const d = new Date(f.date);
    if (!isNaN(d.getTime())) {
      if (d.getTime() > cursor.getTime()) cursor = d;
      if (leg(f) === 1 && (!leg1Frontier || d.getTime() > leg1Frontier.getTime())) leg1Frontier = d;
      const pk = fixturePairKey(f);
      (daysUsedByPair[pk] || (daysUsedByPair[pk] = new Set())).add(dateKey(d));
    }
  });

  const usedSlotKeys = {};
  const scheduledById = {};

  // Assigns `orderedFixtures` into the earliest available pool slots at/after `notBefore`,
  // extending the pool as needed; returns the latest slot actually used (or null).
  function assignPhase(orderedFixtures, notBefore) {
    if (!orderedFixtures.length) return null;
    const slotPool = [];
    let poolCursor = notBefore;
    while (slotPool.length < orderedFixtures.length + slotPattern.length * 2) {
      poolCursor = nextScheduleSlot(poolCursor, slotPattern);
      slotPool.push(poolCursor);
    }
    let latest = null;
    orderedFixtures.forEach((f) => {
      const pk = fixturePairKey(f);
      const usedDays = daysUsedByPair[pk] || (daysUsedByPair[pk] = new Set());
      let chosen = null;
      for (let i = 0; i < slotPool.length; i++) {
        const s = slotPool[i];
        const key = s.toISOString();
        if (usedSlotKeys[key]) continue;
        if (usedDays.has(dateKey(s))) continue;
        chosen = s;
        break;
      }
      if (!chosen) {
        chosen = nextScheduleSlot(slotPool[slotPool.length - 1], slotPattern);
        slotPool.push(chosen);
      }
      usedSlotKeys[chosen.toISOString()] = true;
      usedDays.add(dateKey(chosen));
      scheduledById[f.id] = Object.assign({}, f, { date: chosen.toISOString() });
      if (!latest || chosen.getTime() > latest.getTime()) latest = chosen;
    });
    return latest;
  }

  const leg1Last = assignPhase(leg1Ordered, cursor);
  if (leg1Last && (!leg1Frontier || leg1Last.getTime() > leg1Frontier.getTime())) leg1Frontier = leg1Last;
  assignPhase(leg2Ordered, leg1Frontier || cursor);

  return sortFixturesByDate(list.map((f) => scheduledById[f.id] || f));
}

// Random referee assignment happens once, at the moment a fixture is first created —
// never re-rolled on later regeneration, so a referee already assigned (and possibly
// already told about their match) never silently changes underneath them. Manual
// reassignment (setFixtureReferee) always remains available regardless.
function pickRandomReferee(referees) {
  if (!referees || referees.length === 0) return null;
  return referees[Math.floor(Math.random() * referees.length)].id;
}

function autoGenerateFixtures(teams, existingFixtures, format, schedule, referees) {
  const existingByPair = {};
  (existingFixtures || []).forEach((f) => { existingByPair[f.home + ">" + f.away] = f; });
  const teamIndex = {};
  teams.forEach((t, i) => { teamIndex[t.id] = i; });
  const fixtures = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = 0; j < teams.length; j++) {
      if (i === j) continue;
      if (format === "single" && j < i) continue;
      const home = teams[i].id, away = teams[j].id;
      const key = home + ">" + away;
      if (existingByPair[key]) fixtures.push(existingByPair[key]);
      else fixtures.push({ id: "F" + home + "-" + away + "-" + Date.now() + "-" + i + j, date: "TBD", home: home, away: away, played: false, events: [], refereeId: pickRandomReferee(referees) });
    }
  }
  // In double round-robin, whichever team was added earlier is the home side of the
  // "first leg" against every opponent — the reverse (return-leg) fixture always comes
  // later in the same nested draw. Use that to keep every return leg scheduled after
  // every first leg, not just interleaved by team freshness.
  const legOf = format === "double" ? (f) => (teamIndex[f.home] < teamIndex[f.away] ? 1 : 2) : null;
  return scheduleFixturesByPriority(fixtures, legOf, buildSchedulePattern(schedule));
}

// ============================================================
// REAL SEASON DATA — a genuine completed Open-category season (5 teams,
// double round robin, all 20 fixtures played) carried over from an earlier
// version of this app. Loaded on demand from Manage (league mode only) via
// "Load Real Season" — never runs automatically, never overwrites anything
// unless the person asks for it. A few of the earliest results only had
// final scores on record, not individual scorers, and are logged against
// each team's "Unrecorded scorer" placeholder.
// ============================================================
const REAL_OPEN_TEAM_SEED = [
  { id: "OXF", name: "Oxford", color: "#2E5A8F",
    players: ["Pato", "Rafo", "Dero", "Wanjohi", "Mugane", "Peter", "Brandon", "Obonyo", "Jose", "Jobu"] },
  { id: "SS", name: "Super Strikers", color: "#B23A2E",
    players: ["Sam", "Farasi", "Ian", "Kuria", "Muturi", "Kevo", "OG", "Alvo"] },
  { id: "RAN", name: "Rangers", color: "#3F7A4E",
    players: ["Wayne", "Mugwe", "Tyson", "Marvel", "Chris", "Imma"] },
  { id: "MAS", name: "Masters", color: "#D97B29",
    players: ["Isaac", "Toma", "Kaama", "Caleb", "Aizo"] },
  { id: "MAN", name: "Mancheli", color: "#C9A227",
    players: ["Ramsey", "Jimmy", "Eddie", "Brayo", "Aizo", "Wafula", "Manu", "Kibe"] },
];
function rsUnk(teamId) { return teamId + "-UNK"; }
function rsG(teamId, name) { return { teamId: teamId, name: name || null, type: "goal" }; }
function rsA(teamId, name) { return { teamId: teamId, name: name || null, type: "assist" }; }
function rsY(teamId, name) { return { teamId: teamId, name: name, type: "yellow" }; }
function rsR(teamId, name) { return { teamId: teamId, name: name, type: "red" }; }

const REAL_OPEN_FIXTURES_SEED = [
  { date: "Aug 1", home: "SS", away: "MAN", events: [rsG("MAN"), rsG("MAN"), rsG("MAN")] },
  { date: "Aug 1", home: "RAN", away: "MAS", events: [rsG("RAN"), rsG("MAS")] },
  { date: "Aug 3", home: "OXF", away: "SS", events: [rsG("OXF", "Jose"), rsA("OXF", "Obonyo"), rsG("SS"), rsG("SS"), rsG("SS"), rsG("SS")] },
  { date: "Aug 3", home: "MAS", away: "MAN", events: [rsG("MAS"), rsG("MAS"), rsG("MAN"), rsG("MAN"), rsG("MAN")] },
  { date: "Aug 4", home: "OXF", away: "RAN", events: [rsG("OXF"), rsG("RAN"), rsG("RAN"), rsG("RAN"), rsG("RAN"), rsG("RAN")] },
  { date: "Aug 4", home: "MAS", away: "SS", events: [rsG("MAS"), rsG("MAS"), rsG("MAS"), rsG("SS"), rsG("SS"), rsG("SS"), rsG("SS"), rsG("SS"), rsG("SS")] },
  { date: "Aug 5", home: "OXF", away: "MAS", events: [
    rsG("OXF", "Pato"), rsA("OXF", "Dero"), rsG("OXF", "Dero"), rsA("OXF", "Mugane"),
    rsG("OXF", "Wanjohi"), rsA("OXF", "Peter"), rsY("OXF", "Pato"),
    rsG("MAS", "Aizo"), rsG("MAS", "Caleb"), rsG("MAS", "Caleb"),
  ] },
  { date: "TBD", home: "RAN", away: "MAN", events: [rsG("MAN"), rsG("MAN")] },
  { date: "Aug 6", home: "OXF", away: "MAN", events: [
    rsG("OXF", "Peter"), rsA("OXF", "Brandon"), rsG("OXF", "Brandon"), rsA("OXF", "Peter"),
    rsG("OXF", "Obonyo"), rsA("OXF", "Peter"),
    rsG("MAN", "Jimmy"), rsA("MAN", "Aizo"), rsG("MAN", "Jimmy"), rsA("MAN", "Eddie"), rsG("MAN", "Jimmy"),
    rsG("MAN", "Brayo"), rsA("MAN", "Jimmy"), rsG("MAN", "Ramsey"), rsA("MAN", "Eddie"), rsG("MAN", "Ramsey"),
    rsG("MAN", "Eddie"), rsA("MAN", "Ramsey"),
  ] },
  { date: "Aug 6", home: "SS", away: "RAN", events: [
    rsG("SS", "Ian"), rsG("SS", "Kuria"), rsG("RAN", "Wayne"),
    rsG("RAN", "Mugwe"), rsG("RAN", "Mugwe"), rsG("RAN", "Mugwe"),
    rsY("RAN", "Wayne"), rsY("RAN", "Mugwe"),
  ] },
  { date: "Aug 7", home: "SS", away: "OXF", events: [
    rsG("SS", "Farasi"), rsA("SS", "Ian"), rsG("SS", "Muturi"), rsA("SS", "Ian"),
    rsG("SS", "Sam"), rsG("SS", "Kuria"), rsA("SS", "Kevo"), rsG("SS", "Kuria"), rsG("SS", "Kuria"),
    rsY("SS", "Farasi"),
    rsG("OXF", "Obonyo"), rsG("OXF", "Dero"), rsA("OXF", "Mugane"), rsG("OXF", "Dero"), rsA("OXF", "Mugane"),
    rsY("OXF", "Obonyo"),
  ] },
  { date: "Aug 7", home: "MAN", away: "MAS", events: [
    rsG("MAN", "Jimmy"), rsA("MAN", "Ramsey"), rsG("MAN", "Jimmy"), rsA("MAN", "Wafula"),
    rsG("MAN", "Ramsey"), rsA("MAN", "Jimmy"),
    rsG("MAS", "Caleb"), rsA("MAS", "Aizo"), rsG("MAS", "Aizo"), rsA("MAS", "Toma"),
  ] },
  { date: "Aug 8", home: "MAS", away: "OXF", events: [
    rsG("MAS", "Toma"), rsG("MAS", "Kaama"), rsA("MAS", "Caleb"), rsG("MAS", "Caleb"), rsA("MAS", "Kaama"),
    rsG("MAS", "Aizo"), rsA("MAS", "Toma"), rsY("MAS", "Toma"),
  ] },
  { date: "Aug 8", home: "RAN", away: "MAN", events: [
    rsG("RAN", "Tyson"), rsG("MAN", "Manu"), rsA("MAN", "Ramsey"), rsG("MAN", "Jimmy"), rsA("MAN", "Ramsey"),
  ] },
  { date: "Aug 10", home: "OXF", away: "RAN", events: [
    rsG("OXF", "Rafo"), rsA("OXF", "Pato"), rsG("OXF", "Rafo"), rsA("OXF", "Jobu"), rsG("OXF", "Mugane"),
    rsY("OXF", "Pato"), rsR("OXF", "Pato"),
    rsG("RAN", "Wayne"), rsA("RAN", "Chris"),
    rsY("RAN", "OG"), rsY("RAN", "Tyson"), rsR("RAN", "Marvel"),
  ] },
  { date: "Aug 10", home: "SS", away: "MAS", events: [
    rsG("SS", "Farasi"), rsA("SS", "Sam"), rsG("SS", "Sam"), rsA("SS", "OG"),
    rsY("SS", "Farasi"), rsY("SS", "Farasi"), rsR("SS", "Farasi"),
    rsG("MAS", "Caleb"), rsY("MAS", "Toma"),
  ] },
  { date: "Aug 11", home: "RAN", away: "SS", events: [
    rsG("SS", "Alvo"), rsA("SS", "Kuria"), rsY("SS", "Kuria"),
    rsY("RAN", "Tyson"), rsY("RAN", "Tyson"), rsR("RAN", "Tyson"),
  ] },
  { date: "Aug 11", home: "MAN", away: "OXF", events: [
    rsG("MAN", "Jimmy"), rsA("MAN", "Eddie"), rsG("OXF", "Rafo"), rsA("OXF", "Mugane"),
  ] },
  { date: "Aug 12", home: "MAN", away: "SS", events: [
    rsG("MAN", "Kibe"), rsA("MAN", "Ramsey"), rsG("MAN", "Jimmy"), rsA("MAN", "Kibe"),
    rsY("MAN", "Ramsey"), rsG("SS", "Farasi"), rsY("SS", "Farasi"),
  ] },
  { date: "Aug 12", home: "MAS", away: "RAN", events: [rsG("MAS", "Caleb"), rsG("MAS", "Kaama")] },
];

function buildRealOpenSeason() {
  const teams = REAL_OPEN_TEAM_SEED.map((t) => {
    const players = t.players.map((n, i) => ({ id: t.id + "-P" + (i + 1), name: n, position: "" }));
    players.push({ id: rsUnk(t.id), name: "Unrecorded scorer", unknown: true });
    return { id: t.id, name: t.name, color: t.color, players: players };
  });
  const teamsById = {};
  teams.forEach((t) => (teamsById[t.id] = t));
  const findPlayerId = (teamId, name) => {
    if (!name) return rsUnk(teamId);
    const team = teamsById[teamId];
    const p = team && team.players.find((pp) => pp.name === name);
    return p ? p.id : rsUnk(teamId);
  };
  const convertEvents = (rawEvents) => {
    const out = [];
    for (let i = 0; i < rawEvents.length; i++) {
      const e = rawEvents[i];
      if (e.type === "assist") continue; // consumed by the preceding goal
      if (e.type === "goal") {
        const next = rawEvents[i + 1];
        const assistId = next && next.type === "assist" ? findPlayerId(next.teamId, next.name) : null;
        out.push({ playerId: findPlayerId(e.teamId, e.name), teamId: e.teamId, type: "goal", assistPlayerId: assistId, penalty: false });
      } else {
        out.push({ playerId: findPlayerId(e.teamId, e.name), teamId: e.teamId, type: e.type });
      }
    }
    return out;
  };
  const fixtures = REAL_OPEN_FIXTURES_SEED.map((f, i) => ({
    id: "REAL-F" + (i + 1), date: f.date, home: f.home, away: f.away, played: true, events: convertEvents(f.events),
  }));
  return {
    label: "Open", mode: "league", format: "double", teams: teams, fixtures: fixtures,
    note: "A handful of early results (Aug 1\u20134) only had final scores on record, not individual scorers \u2014 logged as \u201cUnrecorded scorer.\u201d",
  };
}

// ============================================================
// CORE KNOCKOUT / AUTO-FIXTURE LOGIC — unchanged from the original design
// ============================================================

// Group count scales with team count, always kept a power of two (1,2,4,8) so the
// knockout bracket that follows is always a clean single-elimination shape — no byes needed.
function chooseGroupCount(n) {
  if (n < 2) return 1;
  const candidates = [1, 2, 4, 8];
  const target = n / 4;
  const maxAllowed = Math.max(1, Math.floor(n / 2));
  let best = 1;
  candidates.forEach((g) => { if (g <= maxAllowed && Math.abs(g - target) < Math.abs(best - target)) best = g; });
  return best;
}

// Rebuilds group membership + fixtures from the current team list. Teams are dealt into
// groups in the order they were added (team i -> group i % groupCount), so membership stays
// stable as teams are appended. Existing results for pairs still in the same group carry over.
function regenerateGroups(teams, prevGroupFixtures, schedule, referees) {
  const G = chooseGroupCount(teams.length);
  const letters = LETTERS.slice(0, G);
  const groupOf = {};
  teams.forEach((t, i) => { groupOf[t.id] = letters[i % G]; });

  const oldByPair = {};
  Object.values(prevGroupFixtures || {}).forEach((arr) => (arr || []).forEach((f) => { oldByPair[f.home + "|" + f.away] = f; }));

  const fixtures = {};
  letters.forEach((L) => {
    const ids = teams.filter((t) => groupOf[t.id] === L).map((t) => t.id);
    const fx = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const home = ids[i], away = ids[j];
        const existing = oldByPair[home + "|" + away];
        fx.push(existing || { id: home + "-" + away, home: home, away: away, events: [], played: false, date: "TBD", refereeId: pickRandomReferee(referees) });
      }
    }
    fixtures[L] = fx;
  });

  // Schedule kickoffs across the whole draw at once (not group by group), so a team
  // added mid-competition jumps the queue no matter which group it landed in, and every
  // group shares one combined, non-overlapping schedule.
  const flat = [];
  letters.forEach((L) => { fixtures[L].forEach((f) => flat.push(f)); });
  const scheduledById = {};
  scheduleFixturesByPriority(flat, null, buildSchedulePattern(schedule)).forEach((f) => { scheduledById[f.id] = f; });
  letters.forEach((L) => {
    fixtures[L] = sortFixturesByDate(fixtures[L].map((f) => scheduledById[f.id] || f));
  });

  return { groupLetters: letters, groupOf: groupOf, groupFixtures: fixtures };
}

function goalsFor(events, teamId) {
  return (events || []).filter((e) => (e.type === "goal" && e.teamId === teamId) || (e.type === "owngoal" && e.teamId !== teamId)).length;
}

// A walkover overrides the normal event-based scoreline with a flat 3-0 to whichever
// team is recorded as the winner — no individual goals needed. `matchLike` is a league/
// group fixture, or a knockout tie's `match` sub-object; both carry `.events` and,
// once awarded, `.walkover` (the winning team's id).
function matchScore(matchLike, homeId, awayId) {
  if (matchLike.walkover) return matchLike.walkover === homeId ? { hs: 3, as: 0 } : { hs: 0, as: 3 };
  return { hs: goalsFor(matchLike.events, homeId), as: goalsFor(matchLike.events, awayId) };
}

function standingsFor(teams, fixtures) {
  const table = {};
  teams.forEach((t) => { table[t.id] = { id: t.id, name: t.name, color: t.color, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 }; });
  fixtures.forEach((f) => {
    if (!f.played) return;
    const score = matchScore(f, f.home, f.away);
    const hs = score.hs, as = score.as;
    const h = table[f.home], aT = table[f.away];
    if (!h || !aT) return;
    h.P++; aT.P++; h.GF += hs; h.GA += as; aT.GF += as; aT.GA += hs;
    if (hs > as) { h.W++; h.Pts += 3; aT.L++; } else if (hs < as) { aT.W++; aT.Pts += 3; h.L++; } else { h.D++; aT.D++; h.Pts += 1; aT.Pts += 1; }
  });
  Object.values(table).forEach((row) => (row.GD = row.GF - row.GA));
  return Object.values(table).sort((x, y2) => y2.Pts - x.Pts || y2.GD - x.GD || y2.GF - x.GF);
}

function makeTie(home, away) { return { home: home, away: away, match: { events: [], played: false }, pen: { h: "", a: "" } }; }

// Builds the initial knockout shape (an array of rounds, each an array of ties) from
// current group standings. Round count = log2(groupCount) + 1, so it always lands
// cleanly on Final / Semis+Final / QF+SF+Final / R16+QF+SF+Final etc.
function buildKnockout(teams, groupLetters, groupOf, fixtures) {
  const qualifiers = groupLetters.map((L) => {
    const groupTeams = teams.filter((t) => groupOf[t.id] === L);
    const st = standingsFor(groupTeams, fixtures[L]);
    return { winner: st[0].id, runnerUp: st[1].id };
  });
  const G = groupLetters.length;
  let round0;
  if (G === 1) round0 = [makeTie(qualifiers[0].winner, qualifiers[0].runnerUp)];
  else {
    round0 = [];
    for (let k = 0; k < G; k += 2) {
      round0.push(makeTie(qualifiers[k].winner, qualifiers[k + 1].runnerUp));
      round0.push(makeTie(qualifiers[k + 1].winner, qualifiers[k].runnerUp));
    }
  }
  const totalRounds = Math.log2(G) + 1;
  const rounds = [round0];
  for (let r = 1; r < totalRounds; r++) rounds.push(new Array(rounds[r - 1].length / 2).fill(null));
  return rounds;
}

function tieResult(tie) {
  if (!tie) return null;
  if (!tie.match.played) return null;
  const score = matchScore(tie.match, tie.home, tie.away);
  const hs = score.hs, as = score.as;
  if (hs > as) return { winner: tie.home, hs: hs, as: as, onPens: false };
  if (as > hs) return { winner: tie.away, hs: hs, as: as, onPens: false };
  if (tie.pen.h !== "" && tie.pen.a !== "") {
    const ph = Number(tie.pen.h), pa = Number(tie.pen.a);
    if (ph !== pa) return { winner: ph > pa ? tie.home : tie.away, hs: hs, as: as, onPens: true, ph: ph, pa: pa };
  }
  return { winner: null, hs: hs, as: as, tied: true };
}

function propagateRounds(rounds) {
  const next = rounds.map((r) => r.slice());
  for (let r = 0; r < next.length - 1; r++) {
    for (let i = 0; i < next[r].length; i += 2) {
      const rh = tieResult(next[r][i]);
      const ra = tieResult(next[r][i + 1]);
      const h = rh && rh.winner, a = ra && ra.winner;
      const slot = i / 2;
      if (h && a) {
        const existing = next[r + 1][slot];
        next[r + 1][slot] = existing && existing.home === h && existing.away === a ? existing : makeTie(h, a);
      } else next[r + 1][slot] = null;
    }
  }
  return next;
}

function roundLabel(idx, total) {
  const fromEnd = total - 1 - idx;
  const labels = ["Final", "Semi-Finals", "Quarter-Finals", "Round of 16", "Round of 32"];
  return labels[fromEnd] || ("Round " + (idx + 1));
}

// ============================================================
// END core knockout / auto-fixture logic
// ============================================================

function allEventSources(cat) {
  const sources = [];
  if (cat.mode === "league") {
    cat.fixtures.forEach((f) => sources.push(f.events || []));
  } else {
    cat.groupLetters.forEach((L) => (cat.groupFixtures[L] || []).forEach((f) => sources.push(f.events || [])));
    (cat.rounds || []).forEach((round) => round.forEach((tie) => { if (tie) sources.push(tie.match.events || []); }));
  }
  return sources.reduce((acc, arr) => acc.concat(arr), []);
}

function computeLeaderboards(cat) {
  const events = allEventSources(cat);
  const meta = {};
  cat.teams.forEach((t) => t.players.forEach((p) => { if (!p.unknown) meta[p.id] = { id: p.id, name: p.name, position: p.position || "", teamName: t.name, teamColor: t.color, goal: 0, assist: 0, yellow: 0, red: 0, owngoal: 0 }; }));
  events.forEach((e) => {
    if (e.type === "goal") {
      if (meta[e.playerId]) meta[e.playerId].goal++;
      if (e.assistPlayerId && meta[e.assistPlayerId]) meta[e.assistPlayerId].assist++;
    } else if (meta[e.playerId]) {
      meta[e.playerId][e.type]++;
    }
  });
  const all = Object.values(meta);
  const top = (key) => all.filter((p) => p[key] > 0).sort((x, y2) => y2[key] - x[key]).slice(0, 8);
  return { scorers: top("goal"), assists: top("assist"), yellows: top("yellow"), reds: top("red"), owngoals: top("owngoal") };
}

// A red card, or a player's 3rd/6th/9th... yellow, bans them for their team's next match.
// Every match is scanned for a team's own players getting carded — including matches
// that team isn't even playing in, since a player can be carded for interfering with
// someone else's game (a bystander/substitute from another team) — only applying the
// resulting suspension once we reach that team's own next fixture.
// League mode: one flat fixture list shared by all teams.
function computeLeagueSuspensions(teams, fixtures) {
  const byFixture = {};
  const ordered = sortFixturesByDate(fixtures);
  teams.forEach((team) => {
    const yellowCount = {}, pending = {}, pendingReason = {};
    ordered.forEach((f) => {
      if (f.home === team.id || f.away === team.id) {
        Object.keys(pending).forEach((pid) => {
          if (pending[pid] > 0) {
            const p = team.players.find((pp) => pp.id === pid);
            if (!byFixture[f.id]) byFixture[f.id] = [];
            byFixture[f.id].push({ playerId: pid, teamId: team.id, playerName: p ? p.name : "?", reason: pendingReason[pid] || "suspension" });
            pending[pid] -= 1;
          }
        });
      }
      (f.events || []).forEach((e) => {
        if (e.teamId !== team.id) return;
        if (e.type === "red") { pending[e.playerId] = (pending[e.playerId] || 0) + 1; pendingReason[e.playerId] = "red card"; }
        else if (e.type === "yellow") {
          yellowCount[e.playerId] = (yellowCount[e.playerId] || 0) + 1;
          if (yellowCount[e.playerId] % 3 === 0) { pending[e.playerId] = (pending[e.playerId] || 0) + 1; pendingReason[e.playerId] = "3 yellow cards"; }
        }
      });
    });
  });
  return byFixture;
}

// Cup mode: separate record per stage — computed group by group, then a fresh one
// for the knockout below (computeKoSuspensions), since it's a distinct stage. Every
// group's fixtures are scanned together (not just a team's own group) so interference
// in another group's match still counts.
function computeGroupSuspensions(cat) {
  const byFixture = {};
  const allFixtures = sortFixturesByDate(cat.groupLetters.reduce((acc, L) => acc.concat(cat.groupFixtures[L] || []), []));
  cat.teams.forEach((team) => {
    const yellowCount = {}, pending = {}, pendingReason = {};
    allFixtures.forEach((f) => {
      if (f.home === team.id || f.away === team.id) {
        Object.keys(pending).forEach((pid) => {
          if (pending[pid] > 0) {
            const p = team.players.find((pp) => pp.id === pid);
            if (!byFixture[f.id]) byFixture[f.id] = [];
            byFixture[f.id].push({ playerId: pid, teamId: team.id, playerName: p ? p.name : "?", reason: pendingReason[pid] || "suspension" });
            pending[pid] -= 1;
          }
        });
      }
      (f.events || []).forEach((e) => {
        if (e.teamId !== team.id) return;
        if (e.type === "red") { pending[e.playerId] = (pending[e.playerId] || 0) + 1; pendingReason[e.playerId] = "red card"; }
        else if (e.type === "yellow") {
          yellowCount[e.playerId] = (yellowCount[e.playerId] || 0) + 1;
          if (yellowCount[e.playerId] % 3 === 0) { pending[e.playerId] = (pending[e.playerId] || 0) + 1; pendingReason[e.playerId] = "3 yellow cards"; }
        }
      });
    });
  });
  return byFixture;
}

// Same idea for the knockout: walk each team's own sequence of ties, round by round,
// scanning every tie played in each round (not just this team's own) for interference,
// and flag who's banned for their team's next knockout match.
function computeKoSuspensions(cat) {
  const byTie = {}; // "r-i" -> [{playerId, teamId, playerName, reason}]
  if (!cat.rounds) return byTie;
  cat.teams.forEach((team) => {
    const yellowCount = {}, pending = {}, pendingReason = {};
    for (let r = 0; r < cat.rounds.length; r++) {
      const round = cat.rounds[r];
      let i = -1;
      for (let k = 0; k < round.length; k++) { if (round[k] && (round[k].home === team.id || round[k].away === team.id)) { i = k; break; } }
      if (i === -1) break; // not in this round — eliminated, bye, or not yet known; stop walking
      Object.keys(pending).forEach((pid) => {
        if (pending[pid] > 0) {
          const p = team.players.find((pp) => pp.id === pid);
          const key = r + "-" + i;
          if (!byTie[key]) byTie[key] = [];
          byTie[key].push({ playerId: pid, teamId: team.id, playerName: p ? p.name : "?", reason: pendingReason[pid] || "suspension" });
          pending[pid] -= 1;
        }
      });
      round.forEach((tie) => {
        if (!tie || !tie.match) return;
        (tie.match.events || []).forEach((e) => {
          if (e.teamId !== team.id) return;
          if (e.type === "red") { pending[e.playerId] = (pending[e.playerId] || 0) + 1; pendingReason[e.playerId] = "red card"; }
          else if (e.type === "yellow") {
            yellowCount[e.playerId] = (yellowCount[e.playerId] || 0) + 1;
            if (yellowCount[e.playerId] % 3 === 0) { pending[e.playerId] = (pending[e.playerId] || 0) + 1; pendingReason[e.playerId] = "3 yellow cards"; }
          }
        });
      });
    }
  });
  return byTie;
}

// Per-viewer persistence via localStorage. A published page has no window.storage;
// localStorage here is private to this one viewer's browser and acts as an instant-load
// cache — the `db` capability below is the durable copy that survives redeploys.
const STORAGE_KEY = "ruiru-cup-state-v6";
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}
function saveState(next) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
}

// ---------- app state ----------
let state = {
  data: null,
  view: "group",
  addingCategory: false,
  newCatName: "",
  newCatMode: "cup", // "cup" or "league" — which format a newly created category uses
  newCatFormat: "double", // league round-robin format: "single" or "double"
  newTeamRows: 5,
  openFixtureIds: {},   // group fixture id -> bool
  openKoTieIds: {},     // "r-i" -> bool
  openTeamIds: {},      // teamId -> bool (Manage > Teams add-player panels)
  openInterferenceIds: {}, // ctxKey -> bool ("card a player from another team" panel)
  openWalkoverIds: {},  // ctxKey -> bool (walkover chooser panel)
  interferenceTeamId: {},  // ctxKey -> teamId currently picked in that panel
  pendingGoal: null,    // { kind:'group', L, fixtureId, teamId, playerId } | { kind:'ko', r, i, teamId, playerId }
  confirmDeleteCategory: false,
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

// ---------- Django REST API synchronization ----------
let syncStatus = "synced";
let syncDebounceTimer = null;

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && meta.content) return meta.content;
  const cookieMatch = document.cookie.match(/csrftoken=([^;]+)/);
  if (cookieMatch) return cookieMatch[1];
  return "";
}

function updateSyncIndicator() {
  const dot = document.getElementById("sync-dot-el");
  const text = document.getElementById("sync-text-el");
  if (!dot || !text) return;
  dot.className = "sync-dot " + syncStatus;
  if (syncStatus === "synced") {
    text.textContent = "Django DB Synced";
  } else if (syncStatus === "saving") {
    text.textContent = "Saving to DB…";
  } else {
    text.textContent = "Offline / Sync error";
  }
}

async function syncWithServer(nextData) {
  syncStatus = "saving";
  updateSyncIndicator();
  try {
    const res = await fetch("/api/state/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      body: JSON.stringify(nextData),
    });
    if (res.ok) {
      syncStatus = "synced";
    } else {
      console.warn("Server rejected state update:", res.status);
      syncStatus = "error";
    }
  } catch (err) {
    console.warn("Could not push state to server:", err);
    syncStatus = "error";
  }
  updateSyncIndicator();
}

function commitData(next) {
  state.data = next;
  saveState(next);
  render();
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncWithServer(next);
  }, 250);
}

function getCat() { return state.data && state.data.categories[state.data.activeCategory]; }

function updateCat(mutator) {
  const cat = getCat();
  const nextCat = mutator(Object.assign({}, cat));
  const nextData = Object.assign({}, state.data, { categories: Object.assign({}, state.data.categories) });
  nextData.categories[state.data.activeCategory] = nextCat;
  commitData(nextData);
}

// ---------- league-mode (flat fixture list) mutations ----------
function addLeagueEvent(fixtureId, event) {
  updateCat((c) => Object.assign({}, c, { fixtures: c.fixtures.map((f) => f.id === fixtureId ? Object.assign({}, f, { events: (f.events || []).concat([event]) }) : f) }));
}
function removeLeagueEvent(fixtureId, idx) {
  updateCat((c) => Object.assign({}, c, { fixtures: c.fixtures.map((f) => f.id === fixtureId ? Object.assign({}, f, { events: f.events.filter((_, i) => i !== idx) }) : f) }));
}
// Marking a fixture "Final" should never leave it dated "TBD" — if it doesn't already
// have a real date (i.e. it was recorded before its scheduled slot came up), stamp the
// moment it was marked played.
function stampPlayedDate(f, nowPlayed) {
  if (nowPlayed && (!f.date || f.date === "TBD")) return new Date().toISOString();
  return f.date;
}

function toggleLeagueFixturePlayed(fixtureId) {
  updateCat((c) => Object.assign({}, c, { fixtures: c.fixtures.map((f) => {
    if (f.id !== fixtureId) return f;
    const played = !f.played;
    return Object.assign({}, f, { played: played, date: stampPlayedDate(f, played) });
  }) }));
}
// A walkover awards the no-show's opponent a 3-0 win with no individual goal scorers —
// setting a winner marks the fixture played and clears any events (real or otherwise)
// so the scoreline comes purely from the walkover, not a mix of the two; clearing the
// winner (undo) reverts the fixture to a normal, unplayed state.
function setLeagueWalkover(fixtureId, winnerId) {
  updateCat((c) => Object.assign({}, c, { fixtures: c.fixtures.map((f) => f.id === fixtureId
    ? Object.assign({}, f, { walkover: winnerId, played: !!winnerId, events: winnerId ? [] : f.events, date: stampPlayedDate(f, !!winnerId) })
    : f) }));
}

// ---------- group-stage mutations ----------
function addGroupEvent(L, fixtureId, event) {
  updateCat((c) => Object.assign({}, c, { groupFixtures: Object.assign({}, c.groupFixtures, { [L]: c.groupFixtures[L].map((f) => f.id === fixtureId ? Object.assign({}, f, { events: (f.events || []).concat([event]) }) : f) }) }));
}
function removeGroupEvent(L, fixtureId, idx) {
  updateCat((c) => Object.assign({}, c, { groupFixtures: Object.assign({}, c.groupFixtures, { [L]: c.groupFixtures[L].map((f) => f.id === fixtureId ? Object.assign({}, f, { events: f.events.filter((_, i) => i !== idx) }) : f) }) }));
}
function toggleGroupPlayed(L, fixtureId) {
  updateCat((c) => Object.assign({}, c, { groupFixtures: Object.assign({}, c.groupFixtures, { [L]: c.groupFixtures[L].map((f) => {
    if (f.id !== fixtureId) return f;
    const played = !f.played;
    return Object.assign({}, f, { played: played, date: stampPlayedDate(f, played) });
  }) }) }));
}
function setGroupWalkover(L, fixtureId, winnerId) {
  updateCat((c) => Object.assign({}, c, { groupFixtures: Object.assign({}, c.groupFixtures, { [L]: c.groupFixtures[L].map((f) => f.id === fixtureId
    ? Object.assign({}, f, { walkover: winnerId, played: !!winnerId, events: winnerId ? [] : f.events, date: stampPlayedDate(f, !!winnerId) })
    : f) }) }));
}
function startKnockout() {
  updateCat((c) => Object.assign({}, c, { rounds: buildKnockout(c.teams, c.groupLetters, c.groupOf, c.groupFixtures) }));
}

// ---------- knockout mutations ----------
function koTogglePlayed(r, i) {
  updateCat((c) => {
    const rounds = c.rounds.map((rd) => rd.slice());
    const tie = Object.assign({}, rounds[r][i]);
    tie.match = Object.assign({}, tie.match, { played: !tie.match.played });
    rounds[r][i] = tie;
    return Object.assign({}, c, { rounds: propagateRounds(rounds) });
  });
}
function setKoWalkover(r, i, winnerId) {
  updateCat((c) => {
    const rounds = c.rounds.map((rd) => rd.slice());
    const tie = Object.assign({}, rounds[r][i]);
    tie.match = Object.assign({}, tie.match, { walkover: winnerId, played: !!winnerId, events: winnerId ? [] : tie.match.events });
    rounds[r][i] = tie;
    return Object.assign({}, c, { rounds: propagateRounds(rounds) });
  });
}
function updatePens(r, i, side, value) {
  if (!/^\d{0,2}$/.test(value)) return;
  updateCat((c) => {
    const rounds = c.rounds.map((rd) => rd.slice());
    const tie = Object.assign({}, rounds[r][i], { pen: Object.assign({}, rounds[r][i].pen, { [side]: value }) });
    rounds[r][i] = tie;
    return Object.assign({}, c, { rounds: propagateRounds(rounds) });
  });
}
function addKoEvent(r, i, event) {
  updateCat((c) => {
    const rounds = c.rounds.map((rd) => rd.slice());
    const tie = Object.assign({}, rounds[r][i]);
    tie.match = Object.assign({}, tie.match, { events: (tie.match.events || []).concat([event]) });
    rounds[r][i] = tie;
    return Object.assign({}, c, { rounds: propagateRounds(rounds) });
  });
}
function removeKoEvent(r, i, evIdx) {
  updateCat((c) => {
    const rounds = c.rounds.map((rd) => rd.slice());
    const tie = Object.assign({}, rounds[r][i]);
    tie.match = Object.assign({}, tie.match, { events: tie.match.events.filter((_, idx2) => idx2 !== evIdx) });
    rounds[r][i] = tie;
    return Object.assign({}, c, { rounds: propagateRounds(rounds) });
  });
}

// unified dispatchers so the goal/assist picker and match-events panel don't need
// to know whether they're logging against a league fixture, group fixture, or knockout tie
function dispatchAddEvent(ctx, event) {
  if (ctx.kind === "league") addLeagueEvent(ctx.fixtureId, event);
  else if (ctx.kind === "group") addGroupEvent(ctx.L, ctx.fixtureId, event);
  else addKoEvent(ctx.r, ctx.i, event);
}
function dispatchRemoveEvent(ctx, idx) {
  if (ctx.kind === "league") removeLeagueEvent(ctx.fixtureId, idx);
  else if (ctx.kind === "group") removeGroupEvent(ctx.L, ctx.fixtureId, idx);
  else removeKoEvent(ctx.r, ctx.i, idx);
}
function dispatchTogglePlayed(ctx) {
  if (ctx.kind === "league") toggleLeagueFixturePlayed(ctx.fixtureId);
  else if (ctx.kind === "group") toggleGroupPlayed(ctx.L, ctx.fixtureId);
  else koTogglePlayed(ctx.r, ctx.i);
}
function dispatchSetWalkover(ctx, winnerId) {
  if (ctx.kind === "league") setLeagueWalkover(ctx.fixtureId, winnerId);
  else if (ctx.kind === "group") setGroupWalkover(ctx.L, ctx.fixtureId, winnerId);
  else setKoWalkover(ctx.r, ctx.i, winnerId);
}

// ---------- team / category mutations ----------
function addTeam(name, playerEntries) {
  updateCat((c) => {
    const id = "T" + Date.now();
    const color = PALETTE[c.teams.length % PALETTE.length];
    const entries = playerEntries.length ? playerEntries : [1, 2, 3, 4, 5].map((n) => ({ name: "Player " + n, position: "" }));
    const players = entries.map((en, i) => ({ id: id + "-P" + (i + 1), name: en.name, position: en.position || "" }));
    const teams = c.teams.concat([{ id: id, name: name, color: color, players: players }]);
    if (c.mode === "league") {
      const fixtures = autoGenerateFixtures(teams, c.fixtures, c.format, c.schedule, c.referees);
      return Object.assign({}, c, { teams: teams, fixtures: fixtures });
    }
    const regen = regenerateGroups(teams, c.groupFixtures, c.schedule, c.referees);
    // team composition changed the group shape, so any drawn knockout is now stale
    return Object.assign({}, c, { teams: teams, groupLetters: regen.groupLetters, groupOf: regen.groupOf, groupFixtures: regen.groupFixtures, rounds: null });
  });
}
// Re-runs fixture generation against the CURRENT team list (no team added/removed) —
// used when the person changes the match time or active days in Manage, so every
// not-yet-played fixture picks up the new schedule. Already-played fixtures, as always,
// are left exactly as they are.
// `dayCounts` is a {weekday: matchCount} map — see normalizeDayCounts/buildSchedulePattern.
function applySchedule(dayCounts, time) {
  updateCat((c) => {
    const schedule = { days: dayCounts, time: time };
    if (c.mode === "league") {
      const fixtures = autoGenerateFixtures(c.teams, c.fixtures, c.format, schedule, c.referees);
      return Object.assign({}, c, { schedule: schedule, fixtures: fixtures });
    }
    const regen = regenerateGroups(c.teams, c.groupFixtures, schedule, c.referees);
    return Object.assign({}, c, { schedule: schedule, groupLetters: regen.groupLetters, groupOf: regen.groupOf, groupFixtures: regen.groupFixtures });
  });
}

// ---------- referees ----------
function addReferee(name) {
  if (!name.trim()) return;
  updateCat((c) => Object.assign({}, c, { referees: (c.referees || []).concat([{ id: "REF" + Date.now() + Math.floor(Math.random() * 1000), name: name.trim() }]) }));
}
function removeReferee(refId) {
  updateCat((c) => {
    const next = Object.assign({}, c, { referees: (c.referees || []).filter((r) => r.id !== refId) });
    const clear = (f) => (f.refereeId === refId ? Object.assign({}, f, { refereeId: null }) : f);
    if (c.mode === "league") {
      next.fixtures = c.fixtures.map(clear);
    } else {
      next.groupFixtures = {};
      Object.keys(c.groupFixtures).forEach((L) => { next.groupFixtures[L] = c.groupFixtures[L].map(clear); });
      if (c.rounds) next.rounds = c.rounds.map((rd) => rd.map((tie) => (tie ? clear(tie) : tie)));
    }
    return next;
  });
}
function setFixtureReferee(ctx, refId) {
  const val = refId || null;
  if (ctx.kind === "league") {
    updateCat((c) => Object.assign({}, c, { fixtures: c.fixtures.map((f) => f.id === ctx.fixtureId ? Object.assign({}, f, { refereeId: val }) : f) }));
  } else if (ctx.kind === "group") {
    updateCat((c) => Object.assign({}, c, { groupFixtures: Object.assign({}, c.groupFixtures, { [ctx.L]: c.groupFixtures[ctx.L].map((f) => f.id === ctx.fixtureId ? Object.assign({}, f, { refereeId: val }) : f) }) }));
  } else {
    updateCat((c) => {
      const rounds = c.rounds.map((rd) => rd.slice());
      const tie = Object.assign({}, rounds[ctx.r][ctx.i], { refereeId: val });
      rounds[ctx.r][ctx.i] = tie;
      return Object.assign({}, c, { rounds: rounds });
    });
  }
}

function addPlayersToTeam(teamId, entries) {
  if (!entries.length) return;
  updateCat((c) => {
    const teams = c.teams.map((t) => {
      if (t.id !== teamId) return t;
      const startIndex = t.players.length;
      const newPlayers = entries.map((en, i) => ({ id: t.id + "-P" + (startIndex + i + 1), name: en.name, position: en.position || "" }));
      return Object.assign({}, t, { players: t.players.concat(newPlayers) });
    });
    return Object.assign({}, c, { teams: teams });
  });
}
function removePlayer(teamId, playerId) {
  // soft-remove: keep the player record (and their id) so goals, assists, or cards
  // already logged against them stay intact in stats and match history
  updateCat((c) => {
    const teams = c.teams.map((t) => {
      if (t.id !== teamId) return t;
      const players = t.players.map((p) => (p.id === playerId ? Object.assign({}, p, { removed: true }) : p));
      return Object.assign({}, t, { players: players });
    });
    return Object.assign({}, c, { teams: teams });
  });
}
function addCategory() {
  if (!state.newCatName.trim()) return;
  const key = state.newCatName.trim().toLowerCase().replace(/\s+/g, "-");
  const nextCategories = Object.assign({}, state.data.categories);
  const mode = state.newCatMode;
  nextCategories[key] = emptyCategory(state.newCatName.trim(), mode, state.newCatFormat);
  state.newCatName = "";
  state.newCatMode = "cup";
  state.newCatFormat = "double";
  state.addingCategory = false;
  state.view = mode === "league" ? "table" : "group";
  commitData({ categories: nextCategories, activeCategory: key });
}
function deleteCategory(key) {
  const nextCategories = Object.assign({}, state.data.categories);
  delete nextCategories[key];
  let nextActive = state.data.activeCategory;
  let remainingKeys = Object.keys(nextCategories);
  if (nextActive === key) nextActive = remainingKeys[0] || null;
  if (remainingKeys.length === 0) {
    nextCategories.open = emptyCategory("Open", "cup");
    nextActive = "open";
  }
  state.view = nextCategories[nextActive] && nextCategories[nextActive].mode === "league" ? "table" : "group";
  state.confirmDeleteCategory = false;
  commitData({ categories: nextCategories, activeCategory: nextActive });
}

// Replaces the active (league-mode) category's contents with a real,
// already-completed Open-season dataset (5 teams, double round robin,
// all 20 matches played) carried over from an earlier version of this app.
function loadRealSeason() {
  const real = buildRealOpenSeason();
  const key = state.data.activeCategory;
  const nextCategories = Object.assign({}, state.data.categories);
  nextCategories[key] = real;
  state.view = "table";
  commitData({ categories: nextCategories, activeCategory: key });
}

// ---------- durable storage (db capability) ----------
async function initDb() {
  syncStatus = "saving";
  updateSyncIndicator();
  try {
    const res = await fetch("/api/state/");
    if (res.ok) {
      const incoming = await res.json();
      if (incoming && incoming.categories && Object.keys(incoming.categories).length > 0) {
        state.data = incoming;
        saveState(state.data);
        syncStatus = "synced";
        render();
        updateSyncIndicator();
        return;
      }
    }
  } catch (e) {
    console.warn("Could not load state from Django backend, falling back to cache:", e);
  }
  syncStatus = "synced";
  updateSyncIndicator();
}

// ============================================================
// VIEW BUILDERS
// ============================================================

const thNum = { padding: "6px 8px", textAlign: "center" };
const tdNum = { padding: "7px 8px", textAlign: "center" };

function TeamLabel(team, bold, align) {
  if (!team) return el("span");
  return el("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexDirection: align === "right" ? "row-reverse" : "row" } }, [
    el("span", { style: { width: "8px", height: "8px", borderRadius: "4px", background: team.color, display: "inline-block" } }),
    el("span", { style: { color: bold ? "#C9A227" : "#F4F2EA", fontWeight: bold ? "800" : "600", fontSize: "13.5px" } }, [team.name]),
  ]);
}

function ScoreHeader(homeTeam, awayTeam, events, played, walkover) {
  const homeId = homeTeam && homeTeam.id, awayId = awayTeam && awayTeam.id;
  const score = walkover ? matchScore({ walkover: walkover }, homeId, awayId) : { hs: goalsFor(events, homeId), as: goalsFor(events, awayId) };
  const scoreText = played ? score.hs + " – " + score.as : "v";
  return el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } }, [
    TeamLabel(homeTeam),
    el("div", { className: "scoreboard", style: { fontSize: "20px", color: played ? "#F4F2EA" : "#6E9080", minWidth: "56px", textAlign: "center" } }, [scoreText]),
    TeamLabel(awayTeam, false, "right"),
  ]);
}

function ScorersLine(homeTeam, awayTeam, events) {
  const allPlayers = (homeTeam ? homeTeam.players : []).concat(awayTeam ? awayTeam.players : []);
  const goalsForTeam = (teamId) => {
    const lines = [];
    (events || []).forEach((e) => {
      if (e.type === "goal" && e.teamId === teamId) {
        const scorer = allPlayers.find((pp) => pp.id === e.playerId);
        let line = (scorer ? scorer.name : "Unrecorded scorer") + posLabel(scorer);
        if (e.penalty) {
          line += " (pen.)";
        } else if (e.assistPlayerId) {
          const assister = allPlayers.find((pp) => pp.id === e.assistPlayerId);
          line += " (assist: " + (assister ? assister.name : "?") + posLabel(assister) + ")";
        }
        lines.push(line);
      } else if (e.type === "owngoal" && e.teamId !== teamId) {
        const scorer = allPlayers.find((pp) => pp.id === e.playerId);
        lines.push((scorer ? scorer.name : "?") + posLabel(scorer) + " (o.g.)");
      }
    });
    return lines;
  };
  const homeGoals = homeTeam ? goalsForTeam(homeTeam.id) : [];
  const awayGoals = awayTeam ? goalsForTeam(awayTeam.id) : [];
  if (homeGoals.length === 0 && awayGoals.length === 0) return null;
  return el("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px", marginTop: "6px" } }, [
    el("div", { style: { flex: "1", fontSize: "10.5px", color: "#8FA89B", lineHeight: "1.6" } }, homeGoals.map((g) => el("div", {}, ["⚽ " + g]))),
    el("div", { style: { flex: "1", fontSize: "10.5px", color: "#8FA89B", lineHeight: "1.6", textAlign: "right" } }, awayGoals.map((g) => el("div", {}, ["⚽ " + g]))),
  ]);
}

function SuspensionsLine(suspendedList) {
  if (!suspendedList || suspendedList.length === 0) return null;
  return el("div", { style: { marginTop: "6px", fontSize: "10.5px", color: "#E08A7D" } },
    suspendedList.map((s) => el("div", {}, ["🚫 " + s.playerName + " suspended (" + s.reason + ")"]))
  );
}

function GoalAssistPicker(ctx, team, scorerId) {
  const candidates = team.players.filter((p) => !p.unknown && !p.removed && p.id !== scorerId);
  const finish = (assistPlayerId, penalty) => {
    dispatchAddEvent(ctx, { playerId: scorerId, teamId: team.id, type: "goal", assistPlayerId: assistPlayerId, penalty: !!penalty });
    setState({ pendingGoal: null });
  };
  const optionBtn = (label, onclick, danger) => el("button", {
    onclick: onclick,
    style: { background: "#16352A", border: "1px solid " + (danger ? "#B23A2E" : "#2B4E40"), color: danger ? "#E08A7D" : "#DDE6DF", borderRadius: "999px", padding: "4px 10px", fontSize: "11.5px", cursor: "pointer" },
  }, [label]);
  const options = [optionBtn("No assist", () => finish(null, false)), optionBtn("Penalty", () => finish(null, true), true)]
    .concat(candidates.map((p) => optionBtn(p.name, () => finish(p.id, false))))
    .concat([optionBtn("Cancel", () => setState({ pendingGoal: null }))]);
  return el("div", { style: { marginTop: "6px", marginBottom: "6px", padding: "8px", background: "#0B2A20", border: "1px solid #2B4E40", borderRadius: "8px" } }, [
    el("div", { style: { fontSize: "11px", color: "#8FA89B", marginBottom: "6px" } }, ["⚽ Goal for " + (team.players.find((p) => p.id === scorerId) || {}).name + " — who assisted?"]),
    el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } }, options),
  ]);
}

function TeamRoster(team, events, ctx, suspendedIds) {
  if (!team) return el("div");
  const visiblePlayers = team.players.filter((p) => !p.unknown && !p.removed);
  const rows = [
    el("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" } }, [
      el("span", { style: { width: "8px", height: "8px", borderRadius: "4px", background: team.color, display: "inline-block" } }),
      el("span", { style: { fontSize: "11.5px", fontWeight: "700", color: "#DDE6DF" } }, [team.name]),
    ]),
  ];
  if (visiblePlayers.length === 0) {
    rows.push(el("div", { style: { fontSize: "11px", color: "#5E7A6C" } }, ["No players added for this team yet."]));
  }
  const pg = state.pendingGoal;
  const pgMatches = (p) => pg && pg.teamId === team.id && pg.playerId === p.id && pg.kind === ctx.kind &&
    (ctx.kind === "group" ? (pg.L === ctx.L && pg.fixtureId === ctx.fixtureId) : (pg.r === ctx.r && pg.i === ctx.i));
  visiblePlayers.forEach((p) => {
    const counts = { goal: 0, owngoal: 0, yellow: 0, red: 0 };
    events.forEach((e) => {
      if (e.type === "goal" && e.playerId === p.id) counts.goal++;
      else if (e.playerId === p.id && counts[e.type] !== undefined) counts[e.type]++;
    });
    const isSuspended = suspendedIds && suspendedIds.has(p.id);
    const btns = EVENT_TYPES.filter((et) => et.key !== "assist").map((et) => el("button", {
      className: "stat-btn",
      onclick: () => {
        if (et.key === "goal") setState({ pendingGoal: Object.assign({}, ctx, { teamId: team.id, playerId: p.id }) });
        else dispatchAddEvent(ctx, { playerId: p.id, teamId: team.id, type: et.key });
      },
    }, [
      et.icon,
      counts[et.key] > 0 ? el("span", { className: "stat-count" }, [String(counts[et.key])]) : null,
    ]));
    rows.push(el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" } }, [
      el("span", { style: { fontSize: "12px", color: isSuspended ? "#E08A7D" : "#F4F2EA", flex: "1" } }, [p.name + posLabel(p) + (isSuspended ? "  🚫 suspended" : "")]),
      el("div", { style: { display: "flex", gap: "5px" } }, btns),
    ]));
    if (pgMatches(p)) rows.push(GoalAssistPicker(ctx, team, p.id));
  });
  return el("div", {}, rows);
}

// Stable string key per match context, used to key the "card another team's player" panel's
// open/closed state and its team selection independently for every fixture/tie.
function ctxKey(ctx) {
  if (ctx.kind === "group") return "group:" + ctx.L + ":" + ctx.fixtureId;
  if (ctx.kind === "ko") return "ko:" + ctx.r + ":" + ctx.i;
  return "league:" + ctx.fixtureId;
}

// Lets a yellow/red card be logged against a player from a team that ISN'T one of the
// two playing this match — e.g. a substitute or bystander from another team who
// interfered. The card is stored on this match like any other event, but because its
// teamId belongs to a third team, computeLeagueSuspensions / computeGroupSuspensions /
// computeKoSuspensions (which scan every match for a team's own teamId, not just that
// team's own fixtures) still apply the resulting suspension to that team's own next game.
function OutsideCardPanel(ctx, teamsById, homeTeamId, awayTeamId) {
  const key = ctxKey(ctx);
  const outsideTeams = Object.values(teamsById || {}).filter((t) => t.id !== homeTeamId && t.id !== awayTeamId);
  if (outsideTeams.length === 0) return null;
  const isOpen = !!state.openInterferenceIds[key];
  const toggleBtn = el("button", {
    onclick: () => setState({ openInterferenceIds: Object.assign({}, state.openInterferenceIds, { [key]: !isOpen }) }),
    style: { background: "transparent", border: "1px solid #4A2E2E", color: "#C98A7D", borderRadius: "8px", padding: "5px 10px", fontSize: "11px", cursor: "pointer" },
  }, [isOpen ? "Cancel ▲" : "⚠️ Card a player from another team ▾"]);
  if (!isOpen) return el("div", { style: { marginTop: "8px", textAlign: "center" } }, [toggleBtn]);

  const selectedTeamId = state.interferenceTeamId[key] && teamsById[state.interferenceTeamId[key]] ? state.interferenceTeamId[key] : outsideTeams[0].id;
  const selectedTeam = teamsById[selectedTeamId];
  const players = (selectedTeam ? selectedTeam.players : []).filter((p) => !p.unknown && !p.removed);

  const teamSelect = el("select", {
    className: "form-input",
    onchange: (e) => setState({ interferenceTeamId: Object.assign({}, state.interferenceTeamId, { [key]: e.target.value }) }),
  }, outsideTeams.map((t) => el("option", { value: t.id, selected: t.id === selectedTeamId }, [t.name])));

  let playerSelectNode = el("select", { className: "form-input" }, players.map((p) => el("option", { value: p.id }, [p.name + posLabel(p)])));

  const submit = (type) => {
    const pid = playerSelectNode.value;
    if (!pid) return;
    dispatchAddEvent(ctx, { playerId: pid, teamId: selectedTeamId, type: type });
  };

  return el("div", { style: { marginTop: "8px", padding: "8px", background: "#241512", border: "1px solid #4A2E2E", borderRadius: "8px" } }, [
    toggleBtn,
    el("div", { style: { fontSize: "10.5px", color: "#B98F86", margin: "8px 0 6px", lineHeight: "1.5" } }, [
      "For a player whose own team isn't in this match but who interfered with it — the card still counts toward their team's own suspensions.",
    ]),
    el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
      teamSelect,
      players.length ? playerSelectNode : el("div", { style: { fontSize: "11px", color: "#5E7A6C" } }, ["No players added for this team yet."]),
      players.length ? el("div", { style: { display: "flex", gap: "6px" } }, [
        el("button", { onclick: () => submit("yellow"), style: { flex: "1", background: "#16352A", border: "1px solid #C9A227", color: "#F4F2EA", borderRadius: "8px", padding: "6px", cursor: "pointer" } }, ["🟨 Yellow"]),
        el("button", { onclick: () => submit("red"), style: { flex: "1", background: "#16352A", border: "1px solid #B23A2E", color: "#F4F2EA", borderRadius: "8px", padding: "6px", cursor: "pointer" } }, ["🟥 Red"]),
      ]) : null,
    ]),
  ]);
}

function MatchEventsPanel(homeTeam, awayTeam, events, ctx, suspendedIds, teamsById) {
  const children = [
    TeamRoster(homeTeam, events, ctx, suspendedIds),
    el("div", { style: { height: "1px", background: "#1E4636", margin: "8px 0" } }),
    TeamRoster(awayTeam, events, ctx, suspendedIds),
    OutsideCardPanel(ctx, teamsById, homeTeam && homeTeam.id, awayTeam && awayTeam.id),
  ];
  if (events.length > 0) {
    children.push(el("div", { style: { height: "1px", background: "#1E4636", margin: "10px 0 6px" } }));
    children.push(el("div", { style: { fontSize: "10.5px", color: "#6E9080", marginBottom: "4px" } }, ["Logged this match — tap × to undo"]));
    const allPlayers = Object.values(teamsById || {}).reduce((acc, t) => acc.concat(t.players), []);
    const chips = events.map((e, i) => {
      const p = allPlayers.find((pp) => pp.id === e.playerId);
      const eventTeam = teamsById ? teamsById[e.teamId] : null;
      const isOutsider = eventTeam && homeTeam && awayTeam && eventTeam.id !== homeTeam.id && eventTeam.id !== awayTeam.id;
      const et = EVENT_TYPES.find((x) => x.key === e.type);
      let label = (et ? et.icon : "") + " " + (p ? p.name : "Unrecorded scorer");
      if (e.type === "goal" && e.penalty) {
        label += "  (pen.)";
      } else if (e.type === "goal" && e.assistPlayerId) {
        const assistP = allPlayers.find((pp) => pp.id === e.assistPlayerId);
        label += "  🅰️ " + (assistP ? assistP.name : "?");
      } else if (e.type === "owngoal") {
        label += "  (o.g.)";
      } else if (isOutsider) {
        label += "  (" + eventTeam.name + ", not playing)";
      }
      return el("span", { className: "ev-chip" }, [
        label + " ",
        el("span", { className: "ev-remove", onclick: () => dispatchRemoveEvent(ctx, i) }, ["×"]),
      ]);
    });
    children.push(el("div", {}, chips));
  }
  return el("div", { style: { marginTop: "10px", background: "#0B2A20", borderRadius: "10px", padding: "10px" } }, children);
}

// A walkover records a 3-0 result for a no-show with no individual goal scorers — once
// awarded it replaces the normal "Mark Final" / "Add goal..." controls with a plain
// readout and an undo link, since real match events no longer apply to this fixture.
function WalkoverPanel(ctx, matchLike, homeTeam, awayTeam) {
  const key = ctxKey(ctx);
  if (matchLike.walkover) {
    const winner = matchLike.walkover === (homeTeam && homeTeam.id) ? homeTeam : awayTeam;
    return el("div", { style: { textAlign: "center", fontSize: "11px", color: "#C9A227", marginTop: "6px" } }, [
      "🚫 Walkover — " + (winner ? winner.name : "?") + " awarded 3–0  ",
      el("span", { onclick: () => dispatchSetWalkover(ctx, null), style: { color: "#6E9080", textDecoration: "underline", cursor: "pointer" } }, ["undo"]),
    ]);
  }
  const isOpen = !!state.openWalkoverIds[key];
  const toggleBtn = el("button", {
    style: { background: "none", border: "none", color: "#6E9080", fontSize: "11.5px", cursor: "pointer" },
    onclick: () => setState({ openWalkoverIds: Object.assign({}, state.openWalkoverIds, { [key]: !isOpen }) }),
  }, [isOpen ? "Cancel walkover ▲" : "Walkover ▾"]);
  if (!isOpen) return toggleBtn;
  const btnStyle = { flex: "1", background: "#16352A", border: "1px solid #2B4E40", color: "#DDE6DF", borderRadius: "8px", padding: "6px 8px", fontSize: "11px", cursor: "pointer" };
  return el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", alignItems: "stretch", marginTop: "4px" } }, [
    toggleBtn,
    el("div", { style: { display: "flex", gap: "6px" } }, [
      homeTeam ? el("button", { style: btnStyle, onclick: () => dispatchSetWalkover(ctx, homeTeam.id) }, [homeTeam.name + " wins 3–0 (w/o)"]) : null,
      awayTeam ? el("button", { style: btnStyle, onclick: () => dispatchSetWalkover(ctx, awayTeam.id) }, [awayTeam.name + " wins 3–0 (w/o)"]) : null,
    ]),
  ]);
}

// A referee's randomly-assigned name (or "Unassigned"), with a dropdown to reassign to
// any other referee on the category's list — works the same for a league/group fixture
// or a knockout tie, keyed by `refId`/`onChange` rather than the match shape itself.
function RefereeLine(refId, referees, onChange) {
  if (!referees || referees.length === 0) return null;
  const select = el("select", { className: "form-input", style: { padding: "3px 6px", fontSize: "10.5px", width: "auto" } }, [
    el("option", { value: "", selected: !refId }, ["Unassigned"]),
  ].concat(referees.map((r) => el("option", { value: r.id, selected: r.id === refId }, [r.name]))));
  select.addEventListener("change", (e) => onChange(e.target.value || null));
  return el("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "4px", fontSize: "10.5px", color: "#6E9080" } }, [
    "🧑‍⚖️", select,
  ]);
}

function FixtureCard(fixture, homeTeam, awayTeam, ctx, suspendedList, teamsById, referees) {
  const isOpen = !!state.openFixtureIds[fixture.id];
  const suspendedIds = new Set((suspendedList || []).map((s) => s.playerId));
  const children = [
    el("div", { style: { textAlign: "center", fontSize: "11px", color: "#6E9080", marginBottom: "2px", letterSpacing: "0.02em" } }, [formatFixtureDate(fixture.date)]),
    ScoreHeader(homeTeam, awayTeam, fixture.events, fixture.played, fixture.walkover),
    RefereeLine(fixture.refereeId, referees, (val) => setFixtureReferee(ctx, val)),
    fixture.walkover ? null : ScorersLine(homeTeam, awayTeam, fixture.events),
    SuspensionsLine(suspendedList),
    fixture.walkover ? null : el("div", { style: { display: "flex", justifyContent: "center", gap: "10px", marginTop: "6px" } }, [
      el("button", {
        className: "played-toggle",
        onclick: () => dispatchTogglePlayed(ctx),
        style: { background: fixture.played ? "rgba(201,162,39,0.15)" : "transparent", borderColor: fixture.played ? "#C9A227" : "#2B4E40", color: fixture.played ? "#C9A227" : "#8FA89B" },
      }, [fixture.played ? "✓ Final" : "Mark Final"]),
      el("button", {
        style: { background: "none", border: "none", color: "#6E9080", fontSize: "11.5px", cursor: "pointer" },
        onclick: () => { const next = Object.assign({}, state.openFixtureIds); next[fixture.id] = !isOpen; setState({ openFixtureIds: next, pendingGoal: null }); },
      }, [isOpen ? "Hide events ▲" : "Add events ▾"]),
      homeTeam && awayTeam ? el("button", {
        className: "btn-pill-action",
        onclick: () => openH2HModal(homeTeam.id, awayTeam.id),
        title: "Head-to-head records and recent form",
      }, ["⚔️ H2H"]) : null,
      el("a", {
        href: "/fixtures/" + fixture.id + "/sheet/",
        target: "_blank",
        className: "btn-pill-action",
        title: "Open printable official Match Day Sheet (PDF)",
      }, ["📄 Sheet"]),
    ]),
    WalkoverPanel(ctx, fixture, homeTeam, awayTeam),
  ];
  if (isOpen && !fixture.walkover) children.push(MatchEventsPanel(homeTeam, awayTeam, fixture.events || [], ctx, suspendedIds, teamsById));
  return el("div", { className: "fixture-card", style: { padding: "10px 4px", borderBottom: "1px solid #16352A" } }, children);
}

function LeagueTableView(table, teamCount) {
  if (teamCount === 0) return EmptyState("No teams yet in this category — head to Manage to add teams and fixtures.");

  // assign shared rank + a note when two or more teams are genuinely level on
  // points, goal difference, and goals scored — neither is ranked above the other
  const ranks = [];
  for (let i = 0; i < table.length; i++) {
    const r = table[i], prev = table[i - 1];
    ranks.push((prev && prev.Pts === r.Pts && prev.GD === r.GD && prev.GF === r.GF) ? ranks[i - 1] : i + 1);
  }
  const rankCounts = {};
  ranks.forEach((rk) => { rankCounts[rk] = (rankCounts[rk] || 0) + 1; });

  const rows = table.map((r, i) => {
    const tied = rankCounts[ranks[i]] > 1;
    return el("tr", { style: { borderTop: "1px solid #16352A", background: ranks[i] === 1 ? "rgba(201,162,39,0.1)" : "transparent" } }, [
      el("td", { style: { padding: "9px 12px", display: "flex", alignItems: "center", gap: "8px" } }, [
        el("span", { style: { color: "#6E9080", width: "20px" } }, [String(ranks[i]) + (tied ? "=" : "")]),
        el("span", { style: { width: "8px", height: "8px", borderRadius: "4px", background: r.color, display: "inline-block" } }),
        r.name,
      ]),
      el("td", { style: tdNum }, [String(r.P)]),
      el("td", { style: tdNum }, [String(r.W)]),
      el("td", { style: tdNum }, [String(r.D)]),
      el("td", { style: tdNum }, [String(r.L)]),
      el("td", { style: tdNum }, [String(r.GD)]),
      el("td", { style: Object.assign({}, tdNum, { fontWeight: "800", color: "#C9A227" }) }, [String(r.Pts)]),
    ]);
  });
  const anyTied = Object.values(rankCounts).some((c) => c > 1);
  const tbl = el("table", { style: { width: "100%", borderCollapse: "collapse", color: "#F4F2EA", fontSize: "13px" } }, [
    el("thead", {}, [
      el("tr", { style: { color: "#8FA89B", textAlign: "left" } }, [
        el("th", { style: { padding: "10px 12px" } }, ["Team"]),
        el("th", { style: thNum }, ["P"]), el("th", { style: thNum }, ["W"]), el("th", { style: thNum }, ["D"]), el("th", { style: thNum }, ["L"]),
        el("th", { style: thNum }, ["GD"]), el("th", { style: thNum }, ["Pts"]),
      ]),
    ]),
    el("tbody", {}, rows),
  ]);
  const activeCatKey = state.data.activeCategory;
  const tableHeaderBar = el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #1E4636", background: "#0A241C" } }, [
    el("span", { style: { fontWeight: "700", color: "#C9A227", fontSize: "13px", letterSpacing: "0.05em" } }, ["STANDINGS TABLE"]),
    el("a", {
      href: "/api/categories/" + activeCatKey + "/export/standings-csv/",
      className: "csv-export-btn",
      title: "Download standings table as CSV spreadsheet",
    }, ["📥 Export Table CSV"]),
  ]);

  return el("div", { style: { background: "#0F2E24", border: "1px solid #1E4636", borderRadius: "12px", overflow: "hidden" } }, [
    tableHeaderBar,
    el("div", { style: { overflowX: "auto" } }, [tbl]),
    anyTied ? el("div", { style: { padding: "8px 12px", fontSize: "10.5px", color: "#5E7A6C", borderTop: "1px solid #1E4636" } }, [
      "\"=\" marks teams level on points, goal difference, and goals scored — a genuine tie, neither ranked above the other.",
    ]) : null,
  ]);
}

function LeagueFixturesView(fixtures, teamsById, suspensions, referees) {
  if (fixtures.length === 0) return EmptyState("No fixtures yet in this category — add teams under Manage and fixtures generate automatically.");
  const activeCatKey = state.data.activeCategory;
  const fixturesHeaderBar = el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", paddingBottom: "8px", borderBottom: "1px solid #1E4636" } }, [
    el("span", { style: { fontWeight: "700", color: "#C9A227", fontSize: "13px", letterSpacing: "0.05em" } }, ["FIXTURES & RESULTS"]),
    el("a", {
      href: "/api/categories/" + activeCatKey + "/export/fixtures-csv/",
      className: "csv-export-btn",
      title: "Download fixtures schedule and results as CSV",
    }, ["📥 Export Fixtures CSV"]),
  ]);
  const cards = fixtures.map((f) => FixtureCard(f, teamsById[f.home], teamsById[f.away], { kind: "league", fixtureId: f.id }, (suspensions || {})[f.id], teamsById, referees));
  return el("div", { style: { background: "#0F2E24", border: "1px solid #1E4636", borderRadius: "12px", padding: "12px" } }, [fixturesHeaderBar, ...cards]);
}

function GroupView(cat, teamsById, groupSuspensions, groupComplete, hasKnockout) {
  if (cat.teams.length === 0) return EmptyState("No teams yet in this category — add teams under Manage and groups will form automatically.");
  const groupBlocks = cat.groupLetters.map((L) => {
    const gTeams = cat.teams.filter((t) => cat.groupOf[t.id] === L);
    const table = standingsFor(gTeams, cat.groupFixtures[L]);
    const rows = table.map((r, i) => el("tr", { style: { borderTop: "1px solid #16352A", background: i < 2 ? "rgba(201,162,39,0.08)" : "transparent" } }, [
      el("td", { style: { padding: "7px 10px", display: "flex", alignItems: "center", gap: "8px" } }, [
        el("span", { style: { width: "8px", height: "8px", borderRadius: "4px", background: r.color, display: "inline-block" } }),
        r.name,
      ]),
      el("td", { style: tdNum }, [String(r.P)]), el("td", { style: tdNum }, [String(r.W)]), el("td", { style: tdNum }, [String(r.D)]), el("td", { style: tdNum }, [String(r.L)]),
      el("td", { style: tdNum }, [String(r.GD)]),
      el("td", { style: Object.assign({}, tdNum, { fontWeight: "800", color: "#C9A227" }) }, [String(r.Pts)]),
    ]));
    const tbl = el("table", { style: { width: "100%", borderCollapse: "collapse", color: "#F4F2EA", fontSize: "12.5px" } }, [
      el("thead", {}, [el("tr", { style: { color: "#8FA89B", textAlign: "left" } }, [
        el("th", { style: { padding: "6px 10px" } }, ["Team"]),
        el("th", { style: thNum }, ["P"]), el("th", { style: thNum }, ["W"]), el("th", { style: thNum }, ["D"]), el("th", { style: thNum }, ["L"]),
        el("th", { style: thNum }, ["GD"]), el("th", { style: thNum }, ["Pts"]),
      ])]),
      el("tbody", {}, rows),
    ]);
    const fixtureCards = (cat.groupFixtures[L] || []).map((f) => FixtureCard(f, teamsById[f.home], teamsById[f.away], { kind: "group", L: L, fixtureId: f.id }, groupSuspensions[f.id], teamsById, cat.referees));
    return el("div", { style: { marginBottom: "22px", background: "#0F2E24", border: "1px solid #1E4636", borderRadius: "12px", overflow: "hidden" } }, [
      el("div", { style: { padding: "10px 14px", borderBottom: "1px solid #1E4636" } }, [el("div", { className: "scoreboard", style: { color: "#C9A227", fontSize: "20px" } }, ["GROUP " + L])]),
      tbl,
      el("div", { style: { padding: "12px", borderTop: "1px solid #1E4636" } }, fixtureCards),
    ]);
  });

  const footer = el("div", { style: { textAlign: "center", marginTop: "8px" } }, [
    !hasKnockout
      ? el("button", {
          onclick: startKnockout,
          disabled: !groupComplete,
          style: { background: groupComplete ? "#C9A227" : "#2B4E40", color: groupComplete ? "#16201B" : "#5E7A6C", border: "none", borderRadius: "10px", padding: "12px 22px", fontWeight: "800", fontSize: "13.5px", cursor: groupComplete ? "pointer" : "not-allowed" },
        }, [groupComplete ? "Draw the Knockout Stage →" : "Mark all group matches Final to unlock the draw"])
      : el("div", { style: { color: "#8FA89B", fontSize: "12.5px" } }, ["Knockout stage drawn — switch tabs above to view it."]),
  ]);

  return el("div", {}, groupBlocks.concat([footer]));
}

function TieCard(tie, idx, roundIdx, teamsById, koSuspensions, referees) {
  const home = teamsById[tie.home], away = teamsById[tie.away];
  const result = tieResult(tie);
  const needsPens = result && result.tied;
  const decided = result && result.winner;
  const ctx = { kind: "ko", r: roundIdx, i: idx, teamId: null, playerId: null };
  const tieKey = roundIdx + "-" + idx;
  const isOpen = !!state.openKoTieIds[tieKey];
  const suspendedList = koSuspensions[tieKey];
  const suspendedIds = new Set((suspendedList || []).map((s) => s.playerId));

  const penInputs = needsPens ? el("div", { style: { marginTop: "10px", padding: "8px 10px", background: "#16352A", borderRadius: "8px" } }, [
    el("div", { style: { fontSize: "11px", color: "#8FA89B", marginBottom: "6px" } }, ["Level after 90 — penalties"]),
    el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } }, [
      el("span", { style: { fontSize: "12.5px", color: "#DDE6DF" } }, [home ? home.name : ""]),
      el("div", { style: { display: "flex", gap: "6px" } }, [
        (() => {
          const inp = el("input", { type: "text", inputmode: "numeric", value: tie.pen.h, style: { width: "34px", height: "34px", textAlign: "center", borderRadius: "6px", border: "1px solid #2B4E40", background: "#0F2E24", color: "#F4F2EA", fontFamily: "'Bebas Neue', sans-serif", fontSize: "18px" } });
          inp.addEventListener("input", (e) => { if (/^\d{0,2}$/.test(e.target.value)) updatePens(roundIdx, idx, "h", e.target.value); else e.target.value = tie.pen.h; });
          return inp;
        })(),
        el("span", { style: { color: "#8FA89B" } }, ["–"]),
        (() => {
          const inp = el("input", { type: "text", inputmode: "numeric", value: tie.pen.a, style: { width: "34px", height: "34px", textAlign: "center", borderRadius: "6px", border: "1px solid #2B4E40", background: "#0F2E24", color: "#F4F2EA", fontFamily: "'Bebas Neue', sans-serif", fontSize: "18px" } });
          inp.addEventListener("input", (e) => { if (/^\d{0,2}$/.test(e.target.value)) updatePens(roundIdx, idx, "a", e.target.value); else e.target.value = tie.pen.a; });
          return inp;
        })(),
      ]),
      el("span", { style: { fontSize: "12.5px", color: "#DDE6DF" } }, [away ? away.name : ""]),
    ]),
  ]) : null;
  const resultLine = result ? el("div", { style: { marginTop: "8px", fontSize: "11.5px", color: "#8FA89B", textAlign: "center" } }, [
    result.hs + "–" + result.as + (result.onPens ? " · pens " + result.ph + "–" + result.pa : "") + (result.winner ? " · " + (teamsById[result.winner] ? teamsById[result.winner].name : "") + " through" : ""),
  ]) : null;

  const children = [
    el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } }, [
      TeamLabel(home, decided === true && result.winner === tie.home),
      TeamLabel(away, decided === true && result.winner === tie.away, "right"),
    ]),
    ScoreHeader(home, away, tie.match.events, tie.match.played, tie.match.walkover),
    RefereeLine(tie.refereeId, referees, (val) => setFixtureReferee(ctx, val)),
    tie.match.walkover ? null : ScorersLine(home, away, tie.match.events),
    SuspensionsLine(suspendedList),
    tie.match.walkover ? null : el("div", { style: { display: "flex", justifyContent: "center", gap: "10px", marginTop: "6px" } }, [
      el("button", {
        onclick: () => koTogglePlayed(roundIdx, idx),
        className: "played-toggle",
        style: { background: tie.match.played ? "rgba(201,162,39,0.15)" : "transparent", borderColor: tie.match.played ? "#C9A227" : "#2B4E40", color: tie.match.played ? "#C9A227" : "#8FA89B" },
      }, [tie.match.played ? "✓ Final" : "Mark Final"]),
      el("button", {
        onclick: () => { const next = Object.assign({}, state.openKoTieIds); next[tieKey] = !isOpen; setState({ openKoTieIds: next, pendingGoal: null }); },
        style: { background: "none", border: "none", color: "#6E9080", fontSize: "11.5px", cursor: "pointer" },
      }, [isOpen ? "Hide match events ▲" : "Add goal / assist / card ▾"]),
    ]),
    WalkoverPanel(ctx, tie.match, home, away),
  ];
  if (isOpen && !tie.match.walkover) children.push(MatchEventsPanel(home, away, tie.match.events || [], ctx, suspendedIds, teamsById));
  children.push(penInputs, resultLine);

  return el("div", { className: "tie-card", style: { background: "#0F2E24", border: "1px solid " + (decided ? "#C9A227" : "#1E4636"), borderRadius: "12px", padding: "14px", marginBottom: "10px", boxShadow: decided ? "0 0 0 1px rgba(201,162,39,0.25)" : "none" } }, children);
}

function Round(title, ties, roundIdx, teamsById, koSuspensions, placeholderText, referees) {
  const filled = ties.filter(Boolean);
  const body = filled.length === 0
    ? el("div", { style: { color: "#5E7A6C", fontSize: "12.5px", background: "#0F2E24", border: "1px dashed #2B4E40", borderRadius: "10px", padding: "16px", textAlign: "center" } }, [placeholderText])
    : el("div", {}, ties.map((tie, idx) => tie ? TieCard(tie, idx, roundIdx, teamsById, koSuspensions, referees) : null));
  return el("div", { style: { marginBottom: "22px" } }, [
    el("div", { className: "scoreboard", style: { color: "#C9A227", fontSize: "20px", marginBottom: "10px" } }, [title.toUpperCase()]),
    body,
  ]);
}

function KnockoutView(rounds, teamsById, koSuspensions, referees) {
  if (!rounds) {
    return el("div", { style: { background: "#0F2E24", border: "1px solid #1E4636", borderRadius: "12px", padding: "28px", textAlign: "center", color: "#8FA89B" } }, [
      "No knockout draw yet.",
      el("div", { style: { marginTop: "12px" } }, [
        el("button", { onclick: () => setState({ view: "group" }), style: { background: "#C9A227", color: "#16201B", border: "none", borderRadius: "8px", padding: "9px 16px", fontWeight: "700", cursor: "pointer" } }, ["Go finish the group stage"]),
      ]),
    ]);
  }
  const total = rounds.length;
  return el("div", {}, rounds.map((ties, r) => Round(roundLabel(r, total), ties, r, teamsById, koSuspensions, r === 0 ? "—" : "Awaiting " + roundLabel(r - 1, total).toLowerCase() + " winners", referees)));
}

function StatsView(leaderboards) {
  const boards = [
    { key: "scorers", title: "Top Scorers", stat: "goal", icon: "⚽" },
    { key: "assists", title: "Top Assists", stat: "assist", icon: "🅰️" },
    { key: "yellows", title: "Yellow Cards", stat: "yellow", icon: "🟨" },
    { key: "reds", title: "Red Cards", stat: "red", icon: "🟥" },
  ];
  const sections = boards.map((b) => {
    const rows = leaderboards[b.key];
    let body;
    if (rows.length === 0) {
      body = el("div", { style: { padding: "16px", textAlign: "center", color: "#5E7A6C", fontSize: "12px" } }, ["No " + b.title.toLowerCase() + " logged yet."]);
    } else {
      const trs = rows.map((p, i) => el("tr", { style: { borderTop: i === 0 ? "none" : "1px solid #16352A" } }, [
        el("td", { style: { padding: "7px 10px", width: "24px", color: "#8FA89B" } }, [String(i + 1)]),
        el("td", { style: { padding: "7px 10px" } }, [
          el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
            el("span", { style: { width: "8px", height: "8px", borderRadius: "4px", background: p.teamColor, display: "inline-block" } }),
            el("div", {}, [el("div", {}, [p.name]), el("div", { style: { fontSize: "10.5px", color: "#6E9080" } }, [p.position ? p.position + " · " + p.teamName : p.teamName])]),
          ]),
        ]),
        el("td", { style: { padding: "7px 10px", textAlign: "right", fontWeight: "800", color: "#C9A227" } }, [String(p[b.stat])]),
      ]));
      body = el("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "12.5px", color: "#F4F2EA" } }, [el("tbody", {}, trs)]);
    }
    return el("div", { style: { marginBottom: "18px", background: "#0F2E24", border: "1px solid #1E4636", borderRadius: "12px", overflow: "hidden" } }, [
      el("div", { style: { padding: "10px 14px", borderBottom: "1px solid #1E4636", display: "flex", alignItems: "center", gap: "8px" } }, [
        el("span", {}, [b.icon]),
        el("div", { className: "scoreboard", style: { color: "#C9A227", fontSize: "18px" } }, [b.title.toUpperCase()]),
      ]),
      body,
    ]);
  });
  return el("div", {}, sections);
}

function TeamManageRow(t) {
  const isOpen = !!state.openTeamIds[t.id];
  const visiblePlayers = t.players.filter((p) => !p.unknown && !p.removed);
  let nameInput, positionSelect;
  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) return;
    addPlayersToTeam(t.id, [{ name: name, position: positionSelect.value }]);
  };
  const header = el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" } }, [
    el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
      el("span", { style: { width: "8px", height: "8px", borderRadius: "4px", background: t.color, display: "inline-block" } }),
      el("span", { style: { fontSize: "13px", color: "#F4F2EA", fontWeight: "600" } }, [t.name]),
      el("span", { style: { fontSize: "11px", color: "#6E9080" } }, [visiblePlayers.length + " player" + (visiblePlayers.length === 1 ? "" : "s")]),
    ]),
    el("button", {
      onclick: () => { const next = Object.assign({}, state.openTeamIds); next[t.id] = !isOpen; setState({ openTeamIds: next }); },
      style: { background: "none", border: "none", color: "#6E9080", fontSize: "11.5px", cursor: "pointer" },
    }, [isOpen ? "Cancel ▲" : "+ Add players ▾"]),
  ]);
  const children = [header];
  if (isOpen) {
    const rosterChips = visiblePlayers.length > 0
      ? el("div", { style: { marginBottom: "8px" } }, visiblePlayers.map((p) => el("span", { className: "ev-chip" }, [
          p.name + posLabel(p) + " ",
          el("span", { className: "ev-remove", onclick: () => removePlayer(t.id, p.id) }, ["×"]),
        ])))
      : el("div", { style: { fontSize: "11px", color: "#5E7A6C", marginBottom: "8px" } }, ["No players yet."]);
    const rosterHint = visiblePlayers.length > 0
      ? el("div", { style: { fontSize: "10.5px", color: "#6E9080", marginBottom: "8px" } }, ["Tap × to remove a player — their logged goals, assists, and cards stay in the stats."])
      : null;
    nameInput = el("input", { className: "form-input", placeholder: "Player name" });
    positionSelect = el("select", { className: "form-input" }, POSITIONS.map((pos) => el("option", { value: pos.value }, [pos.label])));
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    children.push(el("div", { style: { paddingBottom: "12px" } }, [
      rosterChips, rosterHint,
      el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [nameInput, positionSelect]),
      el("button", { onclick: submit, style: { marginTop: "6px", background: "#C9A227", color: "#16201B", border: "none", borderRadius: "8px", padding: "7px 14px", fontWeight: "700", fontSize: "12px", cursor: "pointer" } }, ["Add"]),
    ]));
  }
  return el("div", { style: { borderBottom: "1px solid #16352A" } }, children);
}

function ManageView(cat, categoryKey) {
  const teams = cat.teams, mode = cat.mode;
  let teamNameInput;
  const playerRowInputs = [];
  const submitTeam = () => {
    const name = teamNameInput.value.trim();
    if (!name) return;
    const entries = playerRowInputs
      .map((row) => ({ name: row.nameInput.value.trim(), position: row.positionSelect.value }))
      .filter((en) => en.name);
    addTeam(name, entries);
    state.newTeamRows = 5;
  };
  teamNameInput = el("input", { className: "form-input", placeholder: "Team name" });

  const playerRows = [];
  for (let i = 0; i < state.newTeamRows; i++) {
    const nameInput = el("input", { className: "form-input", style: { flex: "2" }, placeholder: "Player " + (i + 1) + " name" });
    const positionSelect = el("select", { className: "form-input", style: { flex: "1" } }, POSITIONS.map((pos) => el("option", { value: pos.value }, [pos.label])));
    playerRowInputs.push({ nameInput: nameInput, positionSelect: positionSelect });
    playerRows.push(el("div", { style: { display: "flex", gap: "6px" } }, [nameInput, positionSelect]));
  }

  const modeHelperText = mode === "league"
    ? "Blank rows are skipped, and position is optional. Fixtures generate automatically in " + (cat.format === "single" ? "single round robin (each team plays every other team once)" : "double round robin (each team plays every other team home and away)") + " — adding a team reshapes the whole schedule instantly. Already-played results for pairs that still exist are kept."
    : "Blank rows are skipped, and position is optional. Groups and the knockout bracket size are recalculated from the team count every time you add one — no fixed draw size. Any knockout already drawn resets when the group shape changes, so add all your teams before drawing the knockout.";

  const box = el("div", { style: { background: "#0F2E24", border: "1px solid #1E4636", borderRadius: "12px", padding: "14px", marginBottom: "14px" } }, [
    el("div", { className: "scoreboard", style: { color: "#C9A227", fontSize: "17px", marginBottom: "8px" } }, ["ADD TEAM"]),
    el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      teamNameInput,
      el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, playerRows),
      el("button", {
        onclick: () => setState({ newTeamRows: state.newTeamRows + 1 }),
        style: { background: "none", border: "1px dashed #3F5A4E", color: "#8FA89B", borderRadius: "8px", padding: "6px 0", fontSize: "11.5px", cursor: "pointer" },
      }, ["+ Add another player row"]),
      el("button", { onclick: submitTeam, style: { background: "#C9A227", color: "#16201B", border: "none", borderRadius: "8px", padding: "9px 0", fontWeight: "700", cursor: "pointer" } }, ["+ Add Team"]),
    ]),
    el("div", { style: { fontSize: "11px", color: "#6E9080", marginTop: "10px", lineHeight: "1.5" } }, [modeHelperText]),
  ]);

  const summary = mode === "league"
    ? el("div", { style: { fontSize: "11.5px", color: "#8FA89B", marginBottom: "18px" } }, [
        teams.length === 0
          ? "No teams in this category yet."
          : teams.length + " team" + (teams.length === 1 ? "" : "s") + " · " + cat.fixtures.length + " fixture" + (cat.fixtures.length === 1 ? "" : "s") + ".",
      ])
    : el("div", { style: { fontSize: "11.5px", color: "#8FA89B", marginBottom: "18px" } }, [
        teams.length === 0 ? "No teams in this category yet." : el("div", {}, [
          el("div", {}, [teams.length + " team" + (teams.length === 1 ? "" : "s") + " across " + cat.groupLetters.length + " group" + (cat.groupLetters.length === 1 ? "" : "s") + ":"]),
        ].concat(cat.groupLetters.map((L) => el("div", { style: { marginTop: "4px" } }, [
          el("strong", { style: { color: "#C9A227" } }, [L]), ": " + teams.filter((t) => cat.groupOf[t.id] === L).map((t) => t.name).join(", "),
        ])))),
      ]);

  const teamsBox = teams.length > 0 ? el("div", { style: { background: "#0F2E24", border: "1px solid #1E4636", borderRadius: "12px", padding: "14px", marginBottom: "18px" } }, [
    el("div", { className: "scoreboard", style: { color: "#C9A227", fontSize: "17px", marginBottom: "6px" } }, ["TEAMS"]),
    el("div", {}, teams.map((t) => TeamManageRow(t))),
  ]) : null;

  const dangerChildren = [el("div", { className: "scoreboard", style: { color: "#B23A2E", fontSize: "17px", marginBottom: "8px" } }, ["DANGER ZONE"])];
  if (!state.confirmDeleteCategory) {
    dangerChildren.push(
      el("div", { style: { fontSize: "11.5px", color: "#8FA89B", marginBottom: "10px", lineHeight: "1.5" } }, ["Permanently delete the \"" + cat.label + "\" category — its teams, fixtures, and stats all go with it."]),
      el("button", { onclick: () => setState({ confirmDeleteCategory: true }), style: { background: "transparent", color: "#B23A2E", border: "1px solid #B23A2E", borderRadius: "8px", padding: "9px 14px", fontWeight: "700", fontSize: "12.5px", cursor: "pointer" } }, ["Delete \"" + cat.label + "\" category"])
    );
  } else {
    dangerChildren.push(
      el("div", { style: { fontSize: "12.5px", color: "#F4F2EA", marginBottom: "10px", lineHeight: "1.5" } }, ["Delete \"" + cat.label + "\" and everything in it? This can't be undone."]),
      el("div", { style: { display: "flex", gap: "8px" } }, [
        el("button", { onclick: () => deleteCategory(categoryKey), style: { background: "#B23A2E", color: "#F4F2EA", border: "none", borderRadius: "8px", padding: "9px 14px", fontWeight: "700", fontSize: "12.5px", cursor: "pointer" } }, ["Yes, delete it"]),
        el("button", { onclick: () => setState({ confirmDeleteCategory: false }), style: { background: "transparent", color: "#8FA89B", border: "1px solid #2B4E40", borderRadius: "8px", padding: "9px 14px", fontWeight: "700", fontSize: "12.5px", cursor: "pointer" } }, ["Cancel"]),
      ])
    );
  }
  const dangerBox = el("div", { style: { background: "#0F2E24", border: "1px solid #4A2320", borderRadius: "12px", padding: "14px" } }, dangerChildren);

  const realBox = mode === "league" ? el("div", { style: { background: "#0F2E24", border: "1px solid #1E4636", borderRadius: "12px", padding: "14px", marginBottom: "14px" } }, [
    el("div", { className: "scoreboard", style: { color: "#C9A227", fontSize: "17px", marginBottom: "6px" } }, ["REAL SEASON DATA"]),
    el("div", { style: { fontSize: "11.5px", color: "#8FA89B", marginBottom: "10px", lineHeight: "1.5" } }, [
      "Replaces \"" + cat.label + "\" with a real completed Open-category season — 5 teams, double round robin, all 20 matches played with logged scorers, assists, and cards.",
    ]),
    el("button", { onclick: loadRealSeason, style: { background: "transparent", color: "#C9A227", border: "1px solid #C9A227", borderRadius: "8px", padding: "9px 14px", fontWeight: "700", fontSize: "12.5px", cursor: "pointer" } }, ["📋 Load Real Season"]),
  ]) : null;

  // ---------- schedule (match time + per-day match count) ----------
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const schedule = cat.schedule || DEFAULT_SCHEDULE;
  const liveCounts = normalizeDayCounts(schedule.days); // {weekday: count}, 7 keys not guaranteed
  const dayCounts = {};
  for (let d = 0; d < 7; d++) dayCounts[d] = liveCounts[d] || 0;

  const timeInput = el("input", { type: "time", className: "form-input", value: schedule.time || DEFAULT_SCHEDULE.time });
  const applyNow = () => applySchedule(Object.assign({}, dayCounts), timeInput.value || DEFAULT_SCHEDULE.time);
  timeInput.addEventListener("change", applyNow);

  const dayRows = DAY_LABELS.map((label, idx) => {
    const checked = dayCounts[idx] > 0;
    const countInput = el("input", {
      type: "number", min: "1", max: "10", value: String(dayCounts[idx] || 1), disabled: !checked,
      className: "form-input", style: { width: "44px", padding: "4px 2px", fontSize: "11px", textAlign: "center" },
    });
    const cb = el("input", { type: "checkbox", checked: checked, style: { width: "16px", height: "16px" } });
    cb.addEventListener("change", (e) => {
      const wasOn = dayCounts[idx] > 0;
      const turningOff = wasOn && !e.target.checked;
      if (turningOff && Object.keys(dayCounts).filter((k) => dayCounts[k] > 0).length <= 1) { e.target.checked = true; return; } // at least one day must stay selected
      dayCounts[idx] = e.target.checked ? (parseInt(countInput.value, 10) || 1) : 0;
      countInput.disabled = !e.target.checked;
      applyNow();
    });
    countInput.addEventListener("change", (e) => {
      const v = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
      e.target.value = String(v);
      if (dayCounts[idx] === 0) return;
      dayCounts[idx] = v;
      applyNow();
    });
    return el("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" } }, [
      el("label", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", fontSize: "10.5px", color: "#8FA89B", cursor: "pointer" } }, [cb, label]),
      countInput,
    ]);
  });

  const scheduleBox = el("div", { style: { background: "#0F2E24", border: "1px solid #1E4636", borderRadius: "12px", padding: "14px", marginBottom: "14px" } }, [
    el("div", { className: "scoreboard", style: { color: "#C9A227", fontSize: "17px", marginBottom: "6px" } }, ["SCHEDULE"]),
    el("div", { style: { fontSize: "11px", color: "#6E9080", marginBottom: "10px", lineHeight: "1.5" } }, [
      "A start time, and which days host fixtures — each day can host its own number of matches, spaced an hour apart from the start time. Changing any of this reschedules every not-yet-played fixture; results already recorded are never touched.",
    ]),
    el("div", { style: { marginBottom: "10px" } }, [timeInput]),
    el("div", { style: { display: "flex", justifyContent: "space-between" } }, dayRows),
  ]);

  // ---------- referees ----------
  const referees = cat.referees || [];
  const refNameInput = el("input", { className: "form-input", placeholder: "Referee name" });
  const submitRef = () => { addReferee(refNameInput.value); refNameInput.value = ""; };
  const refereesBox = el("div", { style: { background: "#0F2E24", border: "1px solid #1E4636", borderRadius: "12px", padding: "14px", marginBottom: "14px" } }, [
    el("div", { className: "scoreboard", style: { color: "#C9A227", fontSize: "17px", marginBottom: "6px" } }, ["REFEREES"]),
    el("div", { style: { fontSize: "11px", color: "#6E9080", marginBottom: "10px", lineHeight: "1.5" } }, [
      "New fixtures are assigned a referee at random from this list. Reassign any individual fixture from its match card.",
    ]),
    el("div", { style: { display: "flex", gap: "6px", marginBottom: "10px" } }, [
      refNameInput,
      el("button", { onclick: submitRef, style: { background: "#C9A227", color: "#16201B", border: "none", borderRadius: "8px", padding: "0 14px", fontWeight: "700", cursor: "pointer" } }, ["+ Add"]),
    ]),
    referees.length === 0
      ? el("div", { style: { fontSize: "11.5px", color: "#5E7A6C" } }, ["No referees added yet."])
      : el("div", {}, referees.map((r) => el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #16352A" } }, [
          el("span", { style: { fontSize: "12.5px", color: "#DDE6DF" } }, [r.name]),
          el("button", { onclick: () => removeReferee(r.id), style: { background: "none", border: "none", color: "#B23A2E", fontSize: "11px", cursor: "pointer" } }, ["Remove"]),
        ]))),
  ]);

  return el("div", {}, [realBox, scheduleBox, refereesBox, box, summary, teamsBox, dangerBox]);
}

function EmptyState(text) {
  return el("div", { style: { color: "#5E7A6C", fontSize: "12.5px", background: "#0F2E24", border: "1px dashed #2B4E40", borderRadius: "10px", padding: "20px", textAlign: "center" } }, [text]);
}

// ---------- top-level render ----------
function render() {
  const root = document.getElementById("root");
  root.innerHTML = "";

  if (!state.data) {
    root.appendChild(el("div", { style: { fontFamily: "Inter, sans-serif", padding: "40px", color: "#8FA89B" } }, ["Loading…"]));
    return;
  }

  const data = state.data;
  const cat = data.categories[data.activeCategory];
  const teamsById = {};
  cat.teams.forEach((t) => { teamsById[t.id] = t; });
  const isLeague = cat.mode === "league";

  const leaderboards = computeLeaderboards(cat);

  // mode-specific derived data: standings/suspensions/champion
  let leagueTable = null, leagueSuspensions = {}, isDraw = false;
  let groupComplete = false, groupSuspensions = {}, koSuspensions = {}, champion = null;

  if (isLeague) {
    leagueTable = standingsFor(cat.teams, cat.fixtures);
    leagueSuspensions = computeLeagueSuspensions(cat.teams, cat.fixtures);
    const seasonComplete = cat.fixtures.length > 0 && cat.fixtures.every((f) => f.played);
    const topTeams = seasonComplete && leagueTable.length > 0
      ? leagueTable.filter((r) => r.Pts === leagueTable[0].Pts && r.GD === leagueTable[0].GD && r.GF === leagueTable[0].GF)
      : [];
    if (topTeams.length === 1) champion = topTeams[0];
    else if (topTeams.length > 1) isDraw = true;
  } else {
    groupComplete = cat.groupLetters.length > 0 && cat.groupLetters.every((L) => (cat.groupFixtures[L] || []).every((f) => f.played));
    groupSuspensions = computeGroupSuspensions(cat);
    koSuspensions = computeKoSuspensions(cat);
    const totalRounds = cat.rounds ? cat.rounds.length : 0;
    const finalTie = cat.rounds ? cat.rounds[totalRounds - 1][0] : null;
    const finalResult = finalTie ? tieResult(finalTie) : null;
    champion = finalResult && finalResult.winner ? teamsById[finalResult.winner] : null;
  }

  const header = el("header", { style: { marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" } }, [
    el("img", { src: CLUB_LOGO_SRC, alt: "Ruiru Titans crest", style: { width: "56px", height: "56px", objectFit: "contain", flexShrink: "0" } }),
    el("div", {}, [
      el("div", { style: { color: "#C9A227", fontSize: "12px", letterSpacing: "0.18em", fontWeight: "700", textTransform: "uppercase" } }, ["Ruiru Titans — " + (isLeague ? "League" : "Cup")]),
      el("h1", { className: "scoreboard", style: { color: "#F4F2EA", fontSize: "36px", margin: "4px 0 2px", lineHeight: "1" } }, [cat.label.toUpperCase()]),
      el("div", { style: { color: "#8FA89B", fontSize: "13.5px" } }, [
        isLeague
          ? cat.teams.length + " team" + (cat.teams.length === 1 ? "" : "s") + " · " + (cat.format === "single" ? "single" : "double") + " round robin"
          : "Draw scales with your teams · " + cat.teams.length + " team" + (cat.teams.length === 1 ? "" : "s") + " · " + cat.groupLetters.length + " group" + (cat.groupLetters.length === 1 ? "" : "s"),
      ]),
    ]),
  ]);

  const catChips = Object.keys(data.categories).map((key) => {
    const c = data.categories[key];
    const activeKey = data.activeCategory === key;
    return el("button", {
      className: "cat-chip",
      onclick: () => {
        state.view = c.mode === "league" ? "table" : "group";
        state.confirmDeleteCategory = false;
        state.pendingGoal = null;
        commitData(Object.assign({}, data, { activeCategory: key }));
      },
      style: { padding: "7px 14px", borderRadius: "999px", border: "1px solid " + (activeKey ? "#C9A227" : "#2B4E40"), background: activeKey ? "#C9A227" : "transparent", color: activeKey ? "#16201B" : "#DDE6DF", fontWeight: "700", fontSize: "12.5px", cursor: "pointer" },
    }, [c.label + (c.mode === "league" ? " 🏅" : " 🏆")]);
  });
  let addCatEl;
  if (!state.addingCategory) {
    addCatEl = el("button", { onclick: () => setState({ addingCategory: true }), style: { padding: "7px 14px", borderRadius: "999px", border: "1px dashed #3F5A4E", background: "transparent", color: "#8FA89B", fontSize: "12.5px", cursor: "pointer" } }, ["+ Category"]);
  } else {
    const input = el("input", { className: "form-input", style: { width: "130px", padding: "6px 10px" }, placeholder: "e.g. U15", value: state.newCatName });
    input.addEventListener("input", (e) => { state.newCatName = e.target.value; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") addCategory(); });
    const modeSelect = el("select", { className: "form-input", style: { width: "150px", padding: "6px 10px" } }, [
      el("option", { value: "cup" }, ["Cup (groups + knockout)"]),
      el("option", { value: "league" }, ["League (table only)"]),
    ]);
    modeSelect.value = state.newCatMode;
    modeSelect.addEventListener("change", (e) => { setState({ newCatMode: e.target.value }); });
    const rowChildren = [input, modeSelect];
    if (state.newCatMode === "league") {
      const formatSelect = el("select", { className: "form-input", style: { width: "150px", padding: "6px 10px" } }, [
        el("option", { value: "double" }, ["Double round robin"]),
        el("option", { value: "single" }, ["Single round robin"]),
      ]);
      formatSelect.value = state.newCatFormat;
      formatSelect.addEventListener("change", (e) => { state.newCatFormat = e.target.value; });
      rowChildren.push(formatSelect);
    }
    rowChildren.push(el("button", { onclick: addCategory, style: { background: "#C9A227", color: "#16201B", border: "none", borderRadius: "8px", padding: "0 12px", height: "36px", fontWeight: "700", cursor: "pointer" } }, ["Add"]));
    addCatEl = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" } }, rowChildren);
    setTimeout(() => input.focus(), 0);
  }
  const categoryRail = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "18px" } }, catChips.concat([addCatEl]));

  const championBanner = champion ? el("div", { style: { background: "linear-gradient(135deg, #C9A227, #E4C34A)", borderRadius: "14px", padding: "20px 16px", textAlign: "center", marginBottom: "20px", boxShadow: "0 6px 24px rgba(201,162,39,0.35)" } }, [
    el("div", { style: { fontSize: "11px", letterSpacing: "0.2em", color: "#16201B", fontWeight: "700" } }, [cat.label.toUpperCase() + " CHAMPIONS"]),
    el("div", { className: "scoreboard", style: { fontSize: "34px", color: "#16201B" } }, [champion.name]),
  ]) : (isDraw ? el("div", { style: { background: "linear-gradient(135deg, #C9A227, #E4C34A)", borderRadius: "14px", padding: "20px 16px", textAlign: "center", marginBottom: "20px", boxShadow: "0 6px 24px rgba(201,162,39,0.35)" } }, [
    el("div", { style: { fontSize: "11px", letterSpacing: "0.2em", color: "#16201B", fontWeight: "700" } }, [cat.label.toUpperCase() + " — SEASON TIED"]),
    el("div", { className: "scoreboard", style: { fontSize: "30px", color: "#16201B" } }, ["DRAW"]),
    el("div", { style: { fontSize: "11px", color: "#16201B", marginTop: "4px" } }, ["Level on points, goal difference, and goals scored — no outright champion"]),
  ]) : null);

  const tabs = isLeague
    ? [{ key: "table", label: "Table" }, { key: "fixtures", label: "Fixtures" }, { key: "stats", label: "Stats" }, { key: "manage", label: "Manage" }]
    : [{ key: "group", label: "Table" }, { key: "knockout", label: "Knockout" }, { key: "stats", label: "Stats" }, { key: "manage", label: "Manage" }];
  const tabBar = el("div", { style: { display: "flex", gap: "6px", marginBottom: "22px", background: "#0F2E24", padding: "5px", borderRadius: "12px", border: "1px solid #1E4636" } },
    tabs.map((t) => el("button", {
      className: "tab-btn",
      onclick: () => setState({ view: t.key, confirmDeleteCategory: false, pendingGoal: null }),
      style: { flex: "1", padding: "10px 0", borderRadius: "8px", border: "none", cursor: "pointer", background: state.view === t.key ? "#C9A227" : "transparent", color: state.view === t.key ? "#16201B" : "#8FA89B", fontWeight: "700", fontSize: "12.5px" },
    }, [t.label]))
  );

  let viewEl;
  if (isLeague) {
    if (state.view === "table") viewEl = LeagueTableView(leagueTable, cat.teams.length);
    else if (state.view === "fixtures") viewEl = LeagueFixturesView(cat.fixtures, teamsById, leagueSuspensions, cat.referees);
    else if (state.view === "stats") viewEl = StatsView(leaderboards);
    else viewEl = ManageView(cat, data.activeCategory);
  } else {
    if (state.view === "group") viewEl = GroupView(cat, teamsById, groupSuspensions, groupComplete, !!cat.rounds);
    else if (state.view === "knockout") viewEl = KnockoutView(cat.rounds, teamsById, koSuspensions, cat.referees);
    else if (state.view === "stats") viewEl = StatsView(leaderboards);
    else viewEl = ManageView(cat, data.activeCategory);
  }

  const noteEl = cat.note ? el("div", { style: { marginTop: "18px", fontSize: "11px", color: "#5E7A6C", textAlign: "center", lineHeight: "1.6" } }, [cat.note]) : null;

    const topBar = el("div", { className: "top-nav-bar" }, [
    el("div", { className: "sync-badge" }, [
      el("span", { id: "sync-dot-el", className: "sync-dot " + syncStatus }),
      el("span", { id: "sync-text-el" }, [syncStatus === "saving" ? "Saving to DB…" : syncStatus === "error" ? "Offline / Sync error" : "Django DB Synced"]),
    ]),
    el("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, [
      el("a", { href: "/admin/", target: "_blank", className: "admin-link", title: "Open Django Admin Dashboard" }, ["⚙️ Django Admin"]),
      el("a", { href: "/api/state/", target: "_blank", className: "admin-link", style: { background: "transparent", color: "#8FA89B", borderColor: "#2B4E40" } }, ["{ } API"]),
    ])
  ]);

  const container = el("div", { style: { maxWidth: "720px", margin: "0 auto", padding: "20px 16px 60px" } }, [
    header, categoryRail, championBanner, tabBar, viewEl, noteEl,
  ]);
  root.appendChild(el("div", { style: { minHeight: "100vh", background: "#0B3A2E", fontFamily: "Inter, sans-serif" } }, [topBar, container]));
}

// ---------- boot ----------
state.data = loadState() || { categories: { open: emptyCategory("Open", "cup") }, activeCategory: "open" };
render();
initDb();

})();