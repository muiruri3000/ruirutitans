import React, { useState, useMemo } from 'react';
import { api } from '../api/client';

const SAMPLE_PLAYERS_CSV = `Player Name,Class,Position
Pato,A,ST
Kim,A,CM
Jimmy,A,RW
Rama,A,LW
Mrefu,B,CB
Edu,B,CM
Fraizer,B,ST
Morio,B,CDM
Njugush,B,GK
Symo,B,GK
Bena,B,LB
Deno,B,RB
Fidel,C,CM
Tito,C,CB
Fabian,C,RW
Nyamu,C,LW
Kevo,C,RB
Jose,C,LB
Sam,C,GK
Giddy,C,GK
Brayo,D,ST
Danco,D,CM
Mose,D,CB
Kev,D,LB`;

export const GOOGLE_APPS_SCRIPT_CONTENT = `/**
 * Ruiru Titans FC - Automated Google Form & Connected Google Sheet Setup Script
 *
 * HOW TO USE:
 * 1. Open https://script.google.com/
 * 2. Click "New Project".
 * 3. Delete any default code, paste this entire script, and click "Save".
 * 4. Select the function "createTitansPlayerFormAndSheet" and click "Run".
 * 5. Review permissions when prompted by Google.
 * 6. The Execution Log will display:
 *    - The live public Google Form URL (share with players)
 *    - The Google Form Edit URL
 *    - The connected Google Sheet URL (where responses are stored with dropdowns)
 *    - The direct CSV export link ready to paste into Ruiru Titans Team Balancer!
 */

function createTitansPlayerFormAndSheet() {
  var formTitle = "Ruiru Titans FC — Player Registration & Skill Assessment";
  var formDescription = "Official player registration form for Ruiru Titans FC tournaments and competitions. Please submit your name, tactical playing position, and skill category.";

  // 1. Create the Google Form
  var form = FormApp.create(formTitle);
  form.setDescription(formDescription);
  form.setAllowResponseEdits(false);
  form.setProgressBar(true);
  form.setLimitOneResponsePerUser(false);

  // Field 1: Player Name (Text)
  var nameItem = form.addTextItem();
  nameItem.setTitle("Player Name");
  nameItem.setHelpText("Enter the player's full name (e.g. Patrick Kamau)");
  nameItem.setRequired(true);

  // Field 2: Position (Dropdown)
  var posItem = form.addListItem();
  posItem.setTitle("Position");
  posItem.setHelpText("Select your primary on-pitch playing position");
  posItem.setRequired(true);
  posItem.setChoiceValues([
    "GK — Goalkeeper",
    "LB — Left Back",
    "CB — Center Back",
    "RB — Right Back",
    "CDM — Defensive Midfielder",
    "CM — Central Midfielder",
    "LW — Left Winger",
    "RW — Right Winger",
    "ST — Striker / Center Forward"
  ]);

  // Field 3: Category / Skill Tier (Dropdown)
  var catItem = form.addListItem();
  catItem.setTitle("Category");
  catItem.setHelpText("Select skill class (A = Elite down to E = Novice)");
  catItem.setRequired(true);
  catItem.setChoiceValues([
    "A — Elite / Pro Level",
    "B — Advanced / Strong Club",
    "C — Intermediate / Regular",
    "D — Amateur / Developing",
    "E — Recreational / Novice"
  ]);

  // 2. Create the connected Google Spreadsheet
  var sheetTitle = "Ruiru Titans FC — Player Database & Responses";
  var ss = SpreadsheetApp.create(sheetTitle);
  var sheet = ss.getActiveSheet();
  sheet.setName("Players");

  // Setup headers with data validation dropdowns in the Sheet
  var headers = ["Timestamp", "Player Name", "Position", "Category"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#0B3A2E")
    .setFontColor("#C9A227")
    .setFontWeight("bold")
    .setFontSize(11);
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 170); // Timestamp
  sheet.setColumnWidth(2, 220); // Player Name
  sheet.setColumnWidth(3, 160); // Position
  sheet.setColumnWidth(4, 180); // Category

  // Add Data Validation dropdowns to Sheet columns for manual entry
  var posRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["GK", "LB", "CB", "RB", "CDM", "CM", "LW", "RW", "ST"], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange("C2:C500").setDataValidation(posRule);

  var catRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["A", "B", "C", "D", "E"], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange("D2:D500").setDataValidation(catRule);

  // 3. Connect Google Form to send responses directly to this Google Sheet
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 4. Log all links for the user
  var publishedFormUrl = form.getPublishedUrl();
  var editFormUrl = form.getEditUrl();
  var sheetUrl = ss.getUrl();
  var sheetCsvExportUrl = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?format=csv&gid=0";

  Logger.log("==================================================================");
  Logger.log("✅ RUIRU TITANS GOOGLE FORM & GOOGLE SHEET CREATED SUCCESSFULLY!");
  Logger.log("==================================================================");
  Logger.log("1. Public Google Form Link (share with players):");
  Logger.log(publishedFormUrl);
  Logger.log("\\n2. Google Form Edit Link (admin configuration):");
  Logger.log(editFormUrl);
  Logger.log("\\n3. Connected Google Sheet URL (view responses):");
  Logger.log(sheetUrl);
  Logger.log("\\n4. Direct Google Sheet CSV Link (paste into Ruiru Titans Team Balancer):");
  Logger.log(sheetCsvExportUrl);
  Logger.log("==================================================================");

  return {
    formId: form.getId(),
    formPublicUrl: publishedFormUrl,
    formEditUrl: editFormUrl,
    sheetId: ss.getId(),
    sheetUrl: sheetUrl,
    sheetCsvExportUrl: sheetCsvExportUrl
  };
}`;

const CORE_CLUB_PRESETS = [
  { name: 'Mancheli', color: '#C9A227' },
  { name: 'Super Strikers', color: '#B23A2E' },
  { name: 'Rangers', color: '#3F7A4E' },
  { name: 'Masters', color: '#D97B29' },
  { name: 'Oxford', color: '#2E5A8F' },
];

const PRESET_CLUB_NAMES = [
  'Mancheli',
  'Super Strikers',
  'Rangers',
  'Masters',
  'Oxford',
  'Team 6',
  'Team 7',
  'Team 8',
  'Team 9',
  'Team 10',
];

const TEAM_COLORS = [
  '#C9A227',
  '#2E8B57',
  '#2563EB',
  '#DC2626',
  '#9333EA',
  '#0891B2',
  '#EA580C',
  '#4F46E5',
  '#16A34A',
  '#DB2777',
  '#CA8A04',
  '#0D9488',
];

const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'CDM', 'CM', 'LW', 'RW', 'ST'];

export function normalizePlayerClass(rawVal) {
  const val = String(rawVal || '').trim().toUpperCase();
  if (!val) return '';
  if (val.length === 1 && val >= 'A' && val <= 'Z') return val;
  const m1 = val.match(/^(?:CLASS|CAT|CATEGORY|TIER|GRADE|GROUP|POT|LEVEL)\s*([A-Z])\b/);
  if (m1) return m1[1];
  const m2 = val.match(/^([A-Z])\s*[(\-:/]/);
  if (m2) return m2[1];
  return '';
}

export function parseTabularText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const sample = lines.slice(0, 5).join('\n');
  let delimiter = ',';
  if (sample.includes('\t')) delimiter = '\t';
  else if (sample.includes(';') && !sample.includes(',')) delimiter = ';';
  else if (sample.includes('|') && !sample.includes(',')) delimiter = '|';

  const splitRow = (line) => {
    if (delimiter !== ',') {
      let parts = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
      if (delimiter === '|' && parts.length >= 2 && parts[0] === '' && parts[parts.length - 1] === '') {
        parts = parts.slice(1, -1);
      }
      return parts;
    }
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const rows = [];
  for (const line of lines) {
    const cells = splitRow(line);
    if (!cells.some(Boolean)) continue;
    // Ignore markdown separator rows like --- | ---
    if (cells.every((c) => !c || /^[-:\s]+$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

export function extractPlayersFromRows(rows) {
  if (!rows || !rows.length) return [];
  const firstLower = rows[0].map((c) => String(c || '').trim().toLowerCase());

  let nameCol = null;
  let classCol = null;
  let posCol = null;
  let hasHeader = false;

  firstLower.forEach((cell, idx) => {
    if (
      ['name', 'player', 'player name', 'player_name', 'full name', 'fullname', 'athlete', 'member'].includes(cell) ||
      cell.includes('player') ||
      cell.includes('name')
    ) {
      if (nameCol === null) {
        nameCol = idx;
        hasHeader = true;
      }
    } else if (
      ['class', 'category', 'cat', 'tier', 'grade', 'level', 'pot', 'skill', 'rank', 'rating', 'division'].includes(cell) ||
      cell.includes('class') ||
      cell.includes('category') ||
      cell.includes('tier') ||
      cell.includes('grade')
    ) {
      if (classCol === null) {
        classCol = idx;
        hasHeader = true;
      }
    } else if (['position', 'pos', 'role'].includes(cell) || cell.includes('pos')) {
      if (posCol === null) {
        posCol = idx;
        hasHeader = true;
      }
    }
  });

  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (!dataRows.length) return [];

  if (nameCol === null || classCol === null) {
    const sample = dataRows[0];
    sample.forEach((cell, idx) => {
      const norm = normalizePlayerClass(cell);
      const upper = String(cell || '').trim().toUpperCase();
      if (norm && classCol === null) {
        classCol = idx;
      } else if (POSITIONS.includes(upper) && posCol === null) {
        posCol = idx;
      } else if (nameCol === null && String(cell || '').trim() && !/^\d+$/.test(String(cell || '').trim())) {
        nameCol = idx;
      }
    });
    if (nameCol === null) nameCol = 0;
    if (classCol === null) classCol = nameCol === 0 ? 1 : 0;
  }

  const players = [];
  dataRows.forEach((r, idx) => {
    if (!r || !r.length) return;
    let rawName = nameCol < r.length ? String(r[nameCol] || '').trim() : '';
    let rawCls = classCol < r.length ? String(r[classCol] || '').trim() : '';
    const rawPos = posCol !== null && posCol < r.length ? String(r[posCol] || '').trim().toUpperCase() : '';

    let normCls = normalizePlayerClass(rawCls);
    if (!normCls && normalizePlayerClass(rawName)) {
      normCls = normalizePlayerClass(rawName);
      rawName = rawCls;
    }
    if (!rawName) return;
    if (!normCls) normCls = 'C';

    players.push({
      id: `BAL-P${idx + 1}-${Date.now().toString(36).slice(-3)}`,
      name: rawName,
      player_class: normCls,
      position: POSITIONS.includes(rawPos) ? rawPos : '',
    });
  });

  return players;
}

function balancePlayersClientSide(players, playersPerTeam, existingTeamNames = []) {
  const validPlayers = (players || []).filter((p) => p && String(p.name || '').trim());
  if (!validPlayers.length) {
    throw new Error('Please load or add at least one player before balancing teams.');
  }

  const perTeam = Math.max(1, parseInt(playersPerTeam, 10) || 5);
  const distinctClasses = Array.from(
    new Set(validPlayers.map((p) => normalizePlayerClass(p.player_class || p.class || 'C') || 'C'))
  ).sort();

  const numClasses = distinctClasses.length;
  const classWeights = {};
  distinctClasses.forEach((cls, idx) => {
    classWeights[cls] = numClasses - idx; // A = highest weight, last letter = 1
  });

  const totalPlayers = validPlayers.length;
  const numTeams = Math.max(1, Math.ceil(totalPlayers / perTeam));

  const teams = Array.from({ length: numTeams }, (_, i) => {
    const defaultClub = i < CORE_CLUB_PRESETS.length ? CORE_CLUB_PRESETS[i] : null;
    const existingName =
      existingTeamNames[i] && String(existingTeamNames[i]).trim()
        ? String(existingTeamNames[i]).trim()
        : defaultClub ? defaultClub.name : `Team ${i + 1}`;
    const classCounts = {};
    distinctClasses.forEach((c) => {
      classCounts[c] = 0;
    });
    return {
      team_number: i + 1,
      id: `BAL-TEAM-${i + 1}`,
      name: existingName,
      color: defaultClub ? defaultClub.color : TEAM_COLORS[i % TEAM_COLORS.length],
      players: [],
      class_counts: classCounts,
      total_skill_score: 0,
    };
  });

  // Group players by class A -> Z
  const byClass = {};
  distinctClasses.forEach((c) => {
    byClass[c] = [];
  });

  validPlayers.forEach((p, idx) => {
    const cls = normalizePlayerClass(p.player_class || p.class || 'C') || 'C';
    const pos = POSITIONS.includes(String(p.position || '').toUpperCase())
      ? String(p.position).toUpperCase()
      : '';
    byClass[cls].push({
      id: p.id || `BAL-P${idx + 1}`,
      name: String(p.name).trim(),
      player_class: cls,
      position: pos,
      skill_points: classWeights[cls],
    });
  });

  // Shuffle helper
  const shuffle = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // Distribute each class in order (A -> B -> C -> ... -> last letter)
  distinctClasses.forEach((cls) => {
    const shuffled = shuffle(byClass[cls]);
    // Place GKs first within the class so goalkeepers spread across teams
    shuffled.sort((a, b) => (a.position === 'GK' ? -1 : 1) - (b.position === 'GK' ? -1 : 1));

    shuffled.forEach((player) => {
      let eligible = teams.filter((t) => t.players.length < perTeam);
      if (!eligible.length) eligible = [...teams];

      eligible.sort((a, b) => {
        // 1. Fewest players of this specific category/class
        const classDiff = (a.class_counts[cls] || 0) - (b.class_counts[cls] || 0);
        if (classDiff !== 0) return classDiff;
        // 2. Fewest total players on the team so far
        const countDiff = a.players.length - b.players.length;
        if (countDiff !== 0) return countDiff;
        // 3. Lowest total skill score so far
        const skillDiff = a.total_skill_score - b.total_skill_score;
        if (skillDiff !== 0) return skillDiff;
        // 4. Random tie-breaker
        return Math.random() - 0.5;
      });

      const target = eligible[0];
      target.players.push(player);
      target.class_counts[cls] = (target.class_counts[cls] || 0) + 1;
      target.total_skill_score += player.skill_points;
    });
  });

  teams.forEach((t) => {
    t.player_count = t.players.length;
    t.average_skill_score = t.player_count
      ? Number((t.total_skill_score / t.player_count).toFixed(2))
      : 0;
    t.players.sort((a, b) => {
      if (a.player_class !== b.player_class) return a.player_class.localeCompare(b.player_class);
      return a.name.localeCompare(b.name);
    });
  });

  return {
    teams,
    classes: distinctClasses,
    class_weights: classWeights,
    players_per_team: perTeam,
    total_players: totalPlayers,
    team_count: numTeams,
  };
}

/**
 * Intelligently places new player(s) into existing balanced squads while preserving:
 * 1. Equal roster sizes (prioritizes teams with minimum player count)
 * 2. Goalkeeper priority (places GK on a team without a goalkeeper if possible)
 * 3. Class tier balance (places player on team with fewest players of their specific class)
 * 4. Overall team skill score balance (tiebreaker)
 * Does NOT reshuffle or modify existing player assignments.
 */
export function intelligentlyAddPlayersToTeams(currentTeams, newPlayers, classWeights = {}, classes = []) {
  if (!currentTeams || !currentTeams.length || !newPlayers || !newPlayers.length) {
    return { teams: currentTeams || [], assignments: [], classes, class_weights: classWeights };
  }

  // Clone teams to preserve immutability
  const updatedTeams = currentTeams.map((t) => ({
    ...t,
    players: [...(t.players || [])],
    class_counts: { ...(t.class_counts || {}) },
    total_skill_score: Number(t.total_skill_score || 0),
    player_count: Number(t.players ? t.players.length : 0),
    average_skill_score: Number(t.average_skill_score || 0),
  }));

  // Identify all distinct classes including new ones
  const distinctClasses = [...classes];
  newPlayers.forEach((p) => {
    const cls = normalizePlayerClass(p.player_class || p.class || 'C') || 'C';
    if (!distinctClasses.includes(cls)) {
      distinctClasses.push(cls);
    }
  });
  distinctClasses.sort();

  const numClasses = distinctClasses.length;
  const weights = { ...classWeights };
  distinctClasses.forEach((cls, idx) => {
    if (weights[cls] === undefined) {
      weights[cls] = numClasses - idx;
    }
  });

  // Ensure class counts and total skill scores are synchronized
  updatedTeams.forEach((t) => {
    distinctClasses.forEach((c) => {
      if (t.class_counts[c] === undefined) {
        t.class_counts[c] = t.players.filter(
          (p) => (normalizePlayerClass(p.player_class || p.class || 'C') || 'C') === c
        ).length;
      }
    });
    if (!t.total_skill_score) {
      t.total_skill_score = t.players.reduce((sum, p) => sum + (p.skill_points || weights[p.player_class] || 1), 0);
    }
  });

  // Prepare normalized player entries
  const preparedPlayers = newPlayers.map((p, idx) => {
    const cls = normalizePlayerClass(p.player_class || p.class || 'C') || 'C';
    const rawPos = String(p.position || '').trim().toUpperCase();
    const pos = POSITIONS.includes(rawPos) ? rawPos : '';
    const sp = weights[cls] ?? 1;
    return {
      id: p.id || `BAL-P-ADD-${Date.now().toString(36)}-${idx}`,
      name: String(p.name || '').trim(),
      player_class: cls,
      position: pos,
      skill_points: sp,
      is_newly_added: true,
    };
  });

  // Sort incoming: higher tier first (A -> B -> C), then GKs first within tier
  preparedPlayers.sort((a, b) => {
    const diff = (b.skill_points || 0) - (a.skill_points || 0);
    if (diff !== 0) return diff;
    if (a.position === 'GK' && b.position !== 'GK') return -1;
    if (b.position === 'GK' && a.position !== 'GK') return 1;
    return a.name.localeCompare(b.name);
  });

  const assignments = [];

  preparedPlayers.forEach((player) => {
    const cls = player.player_class;
    const isGk = player.position === 'GK';

    // 1. Minimum squad size
    const minSquadSize = Math.min(...updatedTeams.map((t) => t.players.length));
    let candidates = updatedTeams.filter((t) => t.players.length === minSquadSize);
    if (!candidates.length) candidates = [...updatedTeams];

    // 2. Goalkeeper priority
    if (isGk) {
      const teamsWithoutGk = candidates.filter((t) => !t.players.some((p) => p.position === 'GK'));
      if (teamsWithoutGk.length > 0) {
        candidates = teamsWithoutGk;
      }
    }

    // 3. Lowest class count for this tier
    const minClassCount = Math.min(...candidates.map((t) => t.class_counts[cls] || 0));
    candidates = candidates.filter((t) => (t.class_counts[cls] || 0) === minClassCount);

    // 4. Lowest total skill score
    const minSkill = Math.min(...candidates.map((t) => t.total_skill_score));
    candidates = candidates.filter((t) => t.total_skill_score === minSkill);

    // Pick top candidate
    const chosenTeam = candidates[0];
    chosenTeam.players.push(player);
    chosenTeam.class_counts[cls] = (chosenTeam.class_counts[cls] || 0) + 1;
    chosenTeam.total_skill_score += player.skill_points;
    chosenTeam.player_count = chosenTeam.players.length;
    chosenTeam.average_skill_score = Number(
      (chosenTeam.total_skill_score / chosenTeam.player_count).toFixed(2)
    );

    const chosenIdx = updatedTeams.indexOf(chosenTeam);
    assignments.push({
      player,
      teamIdx: chosenIdx,
      teamName: chosenTeam.name,
      teamId: chosenTeam.id,
    });
  });

  // Sort squad display
  updatedTeams.forEach((t) => {
    t.players.sort((a, b) => {
      if (a.player_class !== b.player_class) return a.player_class.localeCompare(b.player_class);
      return a.name.localeCompare(b.name);
    });
  });

  return {
    teams: updatedTeams,
    classes: distinctClasses,
    class_weights: weights,
    assignments,
  };
}

export function buildGoogleSheetCsvUrls(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) throw new Error('Please paste a Google Sheet link.');

  if (url.includes('output=csv') || url.includes('format=csv') || url.includes('tqx=out:csv')) {
    return [url];
  }

  const pubMatch = url.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9\-_]+)/);
  if (pubMatch) {
    const pubId = pubMatch[1];
    const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
    const gidPart = gidMatch ? `&gid=${gidMatch[1]}` : '';
    return [`https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv${gidPart}`];
  }

  const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/);
  if (sheetMatch) {
    const sheetId = sheetMatch[1];
    const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return [
      `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`,
    ];
  }

  throw new Error("Invalid Google Sheet link. Make sure it contains '/spreadsheets/d/...'.");
}

function getClassTierLabel(cls, distinctClasses) {
  const idx = distinctClasses.indexOf(cls);
  const total = distinctClasses.length;
  if (idx === 0) return 'Elite ★';
  if (total > 1 && idx === total - 1) return 'Amateur';
  if (idx === 1) return 'Advanced';
  if (idx === 2) return 'Intermediate';
  return `Tier ${cls}`;
}

function getClassBadgeStyle(cls, distinctClasses) {
  const idx = distinctClasses.indexOf(cls);
  const palette = [
    { bg: 'rgba(201, 162, 39, 0.22)', border: '#C9A227', color: '#FDE047' }, // A - Gold Elite
    { bg: 'rgba(46, 139, 87, 0.25)', border: '#34D399', color: '#6EE7B7' },  // B - Emerald
    { bg: 'rgba(59, 130, 246, 0.22)', border: '#60A5FA', color: '#93C5FD' }, // C - Blue
    { bg: 'rgba(168, 85, 247, 0.22)', border: '#C084FC', color: '#D8B4FE' }, // D - Purple
    { bg: 'rgba(234, 88, 12, 0.22)', border: '#FB923C', color: '#FDBA74' },  // E - Orange
  ];
  return palette[Math.max(0, idx) % palette.length];
}

export default function TeamBalancerView({
  categories = {},
  activeCategoryKey = 'open',
  activeCategoryLabel = 'Open League',
  onApplyBalancedTeamsToCategory,
  onCreateCategoryWithBalancedTeams,
  onNavigateToCompetitionView,
}) {
  const [inputMode, setInputMode] = useState('upload'); // 'upload' | 'gsheet' | 'paste'
  const [players, setPlayers] = useState(() => extractPlayersFromRows(parseTabularText(SAMPLE_PLAYERS_CSV)));
  const [playersPerTeam, setPlayersPerTeam] = useState(6);
  const [balancedResult, setBalancedResult] = useState(null);
  const [teamNames, setTeamNames] = useState({});

  // Input states
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [rawPasteText, setRawPasteText] = useState(SAMPLE_PLAYERS_CSV);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  // Google Form & Sheet Setup states
  const [showScriptCode, setShowScriptCode] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const handleCopyScript = () => {
    try {
      navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CONTENT);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
      setStatusMsg('📋 Google Apps Script copied to clipboard! Paste it into script.google.com and click Run.');
    } catch {
      setStatusMsg('Select and copy the code from the script viewer below.');
    }
  };

  const handleDownloadScript = () => {
    const blob = new Blob([GOOGLE_APPS_SCRIPT_CONTENT], { type: 'text/javascript;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'google_form_sheet_setup.gs';
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg('⬇️ Downloaded google_form_sheet_setup.gs! Open it in Google Apps Script.');
  };

  // Manual single-player addition state
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerClass, setNewPlayerClass] = useState('A');
  const [newPlayerPosition, setNewPlayerPosition] = useState('');

  // Section 3 quick-add player directly to balanced teams state
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddClass, setQuickAddClass] = useState('B');
  const [quickAddPosition, setQuickAddPosition] = useState('');
  const [quickAddTargetTeam, setQuickAddTargetTeam] = useState('__auto__');
  const [cardInlineAddName, setCardInlineAddName] = useState({});
  const [cardInlineAddClass, setCardInlineAddClass] = useState({});
  const [cardInlineAddPos, setCardInlineAddPos] = useState({});

  // Optional player swap state between generated teams
  const [selectedSwapPlayer, setSelectedSwapPlayer] = useState(null); // { teamIdx, playerIdx }

  // Target competition & New competition creation state
  const [targetCategoryKey, setTargetCategoryKey] = useState(activeCategoryKey || 'open');
  const [replaceExistingTeams, setReplaceExistingTeams] = useState(true);
  const [newCategoryTitle, setNewCategoryTitle] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('league-double'); // 'league-double' | 'league-single' | 'cup'
  const [competitionRefereesInput, setCompetitionRefereesInput] = useState(
    'Ref Kamau, Ref Otieno, Ref Njoroge, Ref Mwangi'
  );
  const [competitionStartDate, setCompetitionStartDate] = useState('');
  const [competitionVenue, setCompetitionVenue] = useState('Thoome Pri.');
  const [savedCompetitionInfo, setSavedCompetitionInfo] = useState(null); // { key, label, mode, fixtureCount, teamCount }

  const parseRefereesList = (raw) =>
    String(raw || '')
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  // Distinct classes sorted A -> Z
  const distinctClasses = useMemo(() => {
    const set = new Set(players.map((p) => normalizePlayerClass(p.player_class) || 'C'));
    return Array.from(set).sort();
  }, [players]);

  const classCountsSummary = useMemo(() => {
    const counts = {};
    distinctClasses.forEach((c) => {
      counts[c] = 0;
    });
    players.forEach((p) => {
      const c = normalizePlayerClass(p.player_class) || 'C';
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }, [players, distinctClasses]);

  const estimatedTeamCount = useMemo(() => {
    const perTeam = Math.max(1, parseInt(playersPerTeam, 10) || 1);
    return Math.max(1, Math.ceil(players.length / perTeam));
  }, [players.length, playersPerTeam]);

  // Handle Excel (.xlsx) or CSV/TSV file upload
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setUploadedFileName(file.name);
    setLoading(true);

    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        // Read as base64 and parse via backend .xlsx parser
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await api.teamBalancer({
          action: 'parse',
          filename: file.name,
          file_base64: base64Data,
        });
        if (res.players && res.players.length) {
          if (balancedResult && balancedResult.teams && balancedResult.teams.length) {
            const existingNames = new Set(
              balancedResult.teams.flatMap((t) => t.players.map((p) => String(p.name || '').trim().toLowerCase()))
            );
            const newPlayers = res.players.filter(
              (p) => !existingNames.has(String(p.name || '').trim().toLowerCase())
            );
            if (newPlayers.length > 0) {
              handleIntelligentlyAddPlayers(newPlayers);
              return;
            }
            setStatusMsg(`ℹ️ All ${res.players.length} players from Excel file are already assigned to squads.`);
            return;
          }
          setPlayers(res.players);
          setBalancedResult(null);
          setStatusMsg(`✅ Loaded ${res.players.length} players from Excel file "${file.name}".`);
        } else {
          throw new Error('No valid player rows found in Excel file.');
        }
      } else {
        // CSV / TSV / TXT
        const text = await file.text();
        const rows = parseTabularText(text);
        const parsedPlayers = extractPlayersFromRows(rows);
        if (!parsedPlayers.length) {
          throw new Error(
            'Could not find player names and class letters (A, B, C...) in the uploaded file.'
          );
        }
        if (balancedResult && balancedResult.teams && balancedResult.teams.length) {
          const existingNames = new Set(
            balancedResult.teams.flatMap((t) => t.players.map((p) => String(p.name || '').trim().toLowerCase()))
          );
          const newPlayers = parsedPlayers.filter(
            (p) => !existingNames.has(String(p.name || '').trim().toLowerCase())
          );
          if (newPlayers.length > 0) {
            handleIntelligentlyAddPlayers(newPlayers);
            return;
          }
          setStatusMsg(`ℹ️ All ${parsedPlayers.length} players from "${file.name}" are already assigned to squads.`);
          return;
        }
        setPlayers(parsedPlayers);
        setRawPasteText(text);
        setBalancedResult(null);
        setStatusMsg(`✅ Loaded ${parsedPlayers.length} players from "${file.name}".`);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to parse file.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Google Sheet link fetch
  const handleFetchGoogleSheet = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    let candidateUrls = [];
    try {
      candidateUrls = buildGoogleSheetCsvUrls(googleSheetUrl);
    } catch (err) {
      setErrorMsg(err.message);
      return;
    }

    setLoading(true);
    try {
      let loadedPlayers = null;

      // 1. Try direct browser fetch from Google Sheet CSV endpoints (works when browser has internet & sheet is shared)
      for (const csvUrl of candidateUrls) {
        try {
          const resp = await fetch(csvUrl);
          if (resp.ok) {
            const csvText = await resp.text();
            if (csvText && !csvText.trim().startsWith('<!DOCTYPE html')) {
              const rows = parseTabularText(csvText);
              const extracted = extractPlayersFromRows(rows);
              if (extracted.length > 0) {
                loadedPlayers = extracted;
                setRawPasteText(csvText);
                break;
              }
            }
          }
        } catch {
          // Try next URL or backend proxy
        }
      }

      // 2. Fallback to backend API fetch
      if (!loadedPlayers) {
        const res = await api.teamBalancer({
          action: 'parse',
          google_sheet_url: googleSheetUrl.trim(),
        });
        if (res.players && res.players.length) {
          loadedPlayers = res.players;
        }
      }

      if (!loadedPlayers || !loadedPlayers.length) {
        throw new Error(
          'Could not read player rows from the Google Sheet. Ensure the sheet sharing permission is set to "Anyone with the link can view" and contains Player Name and Class (A, B, C...) columns.'
        );
      }

      if (balancedResult && balancedResult.teams && balancedResult.teams.length) {
        const existingNames = new Set(
          balancedResult.teams.flatMap((t) => t.players.map((p) => String(p.name || '').trim().toLowerCase()))
        );
        const newPlayers = loadedPlayers.filter(
          (p) => !existingNames.has(String(p.name || '').trim().toLowerCase())
        );
        if (newPlayers.length > 0) {
          handleIntelligentlyAddPlayers(newPlayers);
          return;
        }
        setStatusMsg(`ℹ️ All ${loadedPlayers.length} players from Google Sheet are already in the squads.`);
        return;
      }
      setPlayers(loadedPlayers);
      setBalancedResult(null);
      setStatusMsg(`✅ Imported ${loadedPlayers.length} players from Google Sheet!`);
    } catch (err) {
      setErrorMsg(
        err.message ||
          'Unable to fetch Google Sheet. Make sure the Google Sheet is shared as "Anyone with the link" or paste the rows into the Table/CSV tab.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle Paste Table / CSV text
  const handleParsePastedText = () => {
    setErrorMsg(null);
    setStatusMsg(null);
    const rows = parseTabularText(rawPasteText);
    const parsed = extractPlayersFromRows(rows);
    if (!parsed.length) {
      setErrorMsg(
        'No valid player rows detected. Make sure each line has at least Player Name and Class (A, B, C...).'
      );
      return;
    }
    if (balancedResult && balancedResult.teams && balancedResult.teams.length) {
      const existingNames = new Set(
        balancedResult.teams.flatMap((t) => t.players.map((p) => String(p.name || '').trim().toLowerCase()))
      );
      const newPlayers = parsed.filter(
        (p) => !existingNames.has(String(p.name || '').trim().toLowerCase())
      );
      if (newPlayers.length > 0) {
        handleIntelligentlyAddPlayers(newPlayers);
        return;
      }
      setStatusMsg(`ℹ️ All ${parsed.length} players from pasted text are already in the squads.`);
      return;
    }
    setPlayers(parsed);
    setBalancedResult(null);
    setStatusMsg(`✅ Parsed ${parsed.length} players from table text.`);
  };

  // Download sample CSV template
  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_PLAYERS_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ruiru_titans_player_classes_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Intelligently assign new player(s) into existing balanced teams without requiring reshuffling
  const handleIntelligentlyAddPlayers = (newPlayersList) => {
    if (!newPlayersList || !newPlayersList.length) return;

    if (!balancedResult || !balancedResult.teams || !balancedResult.teams.length) {
      setPlayers((prev) => [...prev, ...newPlayersList]);
      setStatusMsg(`➕ Added ${newPlayersList.length} player(s) to the squad list.`);
      return;
    }

    const result = intelligentlyAddPlayersToTeams(
      balancedResult.teams,
      newPlayersList,
      balancedResult.class_weights,
      balancedResult.classes
    );

    setBalancedResult((prev) => ({
      ...prev,
      teams: result.teams,
      classes: result.classes,
      class_weights: result.class_weights,
      total_players: (prev.total_players || 0) + newPlayersList.length,
    }));

    setPlayers((prev) => [...prev, ...newPlayersList]);

    if (result.assignments.length === 1) {
      const a = result.assignments[0];
      setStatusMsg(
        `✨ Intelligently placed "${a.player.name}" (${a.player.player_class}${a.player.position ? ` · ${a.player.position}` : ''}) into ${a.teamName} — squad size & skill balance maintained without reshuffling!`
      );
    } else {
      const summary = result.assignments.map((a) => `${a.player.name} → ${a.teamName}`).join(', ');
      setStatusMsg(
        `✨ Intelligently distributed ${result.assignments.length} player(s) (${summary}) — all teams remain balanced without reshuffling!`
      );
    }
  };

  // Add/Update/Remove individual player rows in the interactive table
  const handleAddSinglePlayer = (e) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    const names = newPlayerName.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const normCls = normalizePlayerClass(newPlayerClass) || 'C';

    const newPlayers = names.map((name, idx) => ({
      id: `BAL-P${players.length + idx + 1}-${Date.now().toString(36).slice(-3)}`,
      name,
      player_class: normCls,
      position: newPlayerPosition || '',
    }));

    handleIntelligentlyAddPlayers(newPlayers);
    setNewPlayerName('');
  };

  const handleDirectAddPlayersToTeam = (teamIdx, newPlayersList) => {
    if (!balancedResult || !balancedResult.teams || !balancedResult.teams[teamIdx]) return;
    const weights = balancedResult.class_weights || {};
    const team = balancedResult.teams[teamIdx];
    const teamName = teamNames[teamIdx] ?? team.name ?? `Team ${teamIdx + 1}`;

    const prepared = newPlayersList.map((p, idx) => {
      const cls = normalizePlayerClass(p.player_class || p.class || 'C') || 'C';
      const pos = POSITIONS.includes(String(p.position || '').toUpperCase())
        ? String(p.position).toUpperCase()
        : '';
      const sp = weights[cls] ?? 1;
      return {
        id: p.id || `BAL-P-ADD-${Date.now().toString(36)}-${idx}`,
        name: String(p.name || '').trim(),
        player_class: cls,
        position: pos,
        skill_points: sp,
        is_newly_added: true,
      };
    });

    const nextTeams = balancedResult.teams.map((t, idx) => {
      if (idx !== teamIdx) return t;
      const updatedPlayers = [...t.players, ...prepared];
      const classCounts = { ...(t.class_counts || {}) };
      prepared.forEach((p) => {
        classCounts[p.player_class] = (classCounts[p.player_class] || 0) + 1;
      });
      const totalSkill = updatedPlayers.reduce((sum, p) => sum + (p.skill_points || weights[p.player_class] || 1), 0);
      return {
        ...t,
        players: updatedPlayers,
        class_counts: classCounts,
        total_skill_score: totalSkill,
        player_count: updatedPlayers.length,
        average_skill_score: Number((totalSkill / updatedPlayers.length).toFixed(2)),
      };
    });

    setBalancedResult((prev) => ({
      ...prev,
      teams: nextTeams,
      total_players: (prev.total_players || 0) + prepared.length,
    }));
    setPlayers((prev) => [...prev, ...prepared]);
    setStatusMsg(`✓ Directly added ${prepared.length} player(s) to ${teamName}!`);
  };

  const handleMoveBalancedPlayer = (fromTeamIdx, toTeamIdx, playerIdx) => {
    if (!balancedResult || !balancedResult.teams) return;
    if (fromTeamIdx === toTeamIdx) return;
    const sourceTeam = balancedResult.teams[fromTeamIdx];
    const targetTeam = balancedResult.teams[toTeamIdx];
    if (!sourceTeam || !targetTeam) return;
    const player = sourceTeam.players[playerIdx];
    if (!player) return;

    const weights = balancedResult.class_weights || {};

    const nextTeams = balancedResult.teams.map((t, idx) => {
      if (idx === fromTeamIdx) {
        const updatedPlayers = t.players.filter((_, pIdx) => pIdx !== playerIdx);
        const classCounts = { ...(t.class_counts || {}) };
        classCounts[player.player_class] = Math.max(0, (classCounts[player.player_class] || 1) - 1);
        const totalSkill = updatedPlayers.reduce((sum, p) => sum + (p.skill_points || weights[p.player_class] || 1), 0);
        return {
          ...t,
          players: updatedPlayers,
          class_counts: classCounts,
          total_skill_score: totalSkill,
          player_count: updatedPlayers.length,
          average_skill_score: updatedPlayers.length ? Number((totalSkill / updatedPlayers.length).toFixed(2)) : 0,
        };
      }
      if (idx === toTeamIdx) {
        const updatedPlayers = [...t.players, player];
        const classCounts = { ...(t.class_counts || {}) };
        classCounts[player.player_class] = (classCounts[player.player_class] || 0) + 1;
        const totalSkill = updatedPlayers.reduce((sum, p) => sum + (p.skill_points || weights[p.player_class] || 1), 0);
        return {
          ...t,
          players: updatedPlayers,
          class_counts: classCounts,
          total_skill_score: totalSkill,
          player_count: updatedPlayers.length,
          average_skill_score: Number((totalSkill / updatedPlayers.length).toFixed(2)),
        };
      }
      return t;
    });

    const fromName = teamNames[fromTeamIdx] ?? sourceTeam.name ?? `Team ${fromTeamIdx + 1}`;
    const toName = teamNames[toTeamIdx] ?? targetTeam.name ?? `Team ${toTeamIdx + 1}`;
    setBalancedResult((prev) => ({ ...prev, teams: nextTeams }));
    setStatusMsg(`⇄ Moved ${player.name} from ${fromName} to ${toName}!`);
  };

  const handleQuickAddPlayerToBalancedTeams = (e) => {
    e.preventDefault();
    if (!quickAddName.trim()) return;
    const names = quickAddName.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const normCls = normalizePlayerClass(quickAddClass) || 'B';

    const newPlayers = names.map((name, idx) => ({
      id: `BAL-P${players.length + idx + 1}-${Date.now().toString(36).slice(-3)}`,
      name,
      player_class: normCls,
      position: quickAddPosition || '',
    }));

    if (quickAddTargetTeam === '__auto__' || quickAddTargetTeam === '') {
      handleIntelligentlyAddPlayers(newPlayers);
    } else {
      const tIdx = parseInt(quickAddTargetTeam, 10);
      handleDirectAddPlayersToTeam(tIdx, newPlayers);
    }
    setQuickAddName('');
  };

  const handleUpdatePlayerField = (playerId, field, value) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId) return p;
        if (field === 'player_class') {
          const clean = normalizePlayerClass(value) || value.toUpperCase().slice(0, 1) || 'C';
          return { ...p, player_class: clean };
        }
        return { ...p, [field]: value };
      })
    );
  };

  const handleRemovePlayerRow = (playerId) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    if (balancedResult && balancedResult.teams) {
      setBalancedResult((prev) => {
        if (!prev || !prev.teams) return prev;
        const nextTeams = prev.teams.map((t) => {
          const filtered = t.players.filter((p) => p.id !== playerId);
          if (filtered.length === t.players.length) return t;
          const classCounts = {};
          (prev.classes || []).forEach((c) => {
            classCounts[c] = filtered.filter((p) => p.player_class === c).length;
          });
          const totalSkill = filtered.reduce((sum, p) => sum + (p.skill_points || 1), 0);
          return {
            ...t,
            players: filtered,
            class_counts: classCounts,
            total_skill_score: totalSkill,
            player_count: filtered.length,
            average_skill_score: filtered.length ? Number((totalSkill / filtered.length).toFixed(2)) : 0,
          };
        });
        return {
          ...prev,
          teams: nextTeams,
          total_players: Math.max(0, (prev.total_players || 1) - 1),
        };
      });
    }
  };

  // Generate Balanced Teams
  const handleGenerateBalancedTeams = () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setSelectedSwapPlayer(null);

    try {
      const currentNamesList = balancedResult?.teams
        ? balancedResult.teams.map((t, idx) => teamNames[idx] || t.name)
        : [];
      const result = balancePlayersClientSide(players, playersPerTeam, currentNamesList);
      setBalancedResult(result);

      const initialNames = {};
      result.teams.forEach((t, idx) => {
        initialNames[idx] = teamNames[idx] || t.name || `Team ${idx + 1}`;
      });
      setTeamNames(initialNames);
      setStatusMsg(
        `⚖️ Generated ${result.team_count} balanced teams (${result.players_per_team} players per team) across Categories ${result.classes.join(', ')}!`
      );
    } catch (err) {
      setErrorMsg(err.message || 'Could not balance teams.');
    }
  };

  // Update a team's assigned name
  const handleTeamNameChange = (teamIdx, newName) => {
    setTeamNames((prev) => ({ ...prev, [teamIdx]: newName }));
    if (balancedResult) {
      setBalancedResult((prev) => {
        if (!prev) return prev;
        const nextTeams = prev.teams.map((t, idx) =>
          idx === teamIdx ? { ...t, name: newName } : t
        );
        return { ...prev, teams: nextTeams };
      });
    }
  };

  // Auto-fill preset club names
  const handleAssignPresetNames = () => {
    if (!balancedResult) return;
    const nextNames = {};
    const nextTeams = balancedResult.teams.map((t, idx) => {
      const preset = idx < CORE_CLUB_PRESETS.length ? CORE_CLUB_PRESETS[idx].name : (PRESET_CLUB_NAMES[idx] || `Team ${idx + 1}`);
      const color = idx < CORE_CLUB_PRESETS.length ? CORE_CLUB_PRESETS[idx].color : t.color;
      nextNames[idx] = preset;
      return { ...t, name: preset, color };
    });
    setTeamNames(nextNames);
    setBalancedResult({ ...balancedResult, teams: nextTeams });
    setStatusMsg('🏷️ Assigned club names to all balanced teams! You can customize any name below.');
  };

  // Swap two players between generated teams
  const handleSwapClick = (teamIdx, playerIdx) => {
    if (!selectedSwapPlayer) {
      setSelectedSwapPlayer({ teamIdx, playerIdx });
      return;
    }
    if (
      selectedSwapPlayer.teamIdx === teamIdx &&
      selectedSwapPlayer.playerIdx === playerIdx
    ) {
      setSelectedSwapPlayer(null);
      return;
    }

    setBalancedResult((prev) => {
      if (!prev) return prev;
      const nextTeams = prev.teams.map((t) => ({
        ...t,
        players: [...t.players],
        class_counts: { ...t.class_counts },
      }));

      const tA = nextTeams[selectedSwapPlayer.teamIdx];
      const tB = nextTeams[teamIdx];
      const pA = tA.players[selectedSwapPlayer.playerIdx];
      const pB = tB.players[playerIdx];

      tA.players[selectedSwapPlayer.playerIdx] = pB;
      tB.players[playerIdx] = pA;

      // Recompute metrics for both teams
      [tA, tB].forEach((team) => {
        const counts = {};
        prev.classes.forEach((c) => {
          counts[c] = 0;
        });
        let totalScore = 0;
        team.players.forEach((p) => {
          counts[p.player_class] = (counts[p.player_class] || 0) + 1;
          totalScore += p.skill_points || prev.class_weights[p.player_class] || 1;
        });
        team.class_counts = counts;
        team.total_skill_score = totalScore;
        team.average_skill_score = team.players.length
          ? Number((totalScore / team.players.length).toFixed(2))
          : 0;
      });

      return { ...prev, teams: nextTeams };
    });
    setSelectedSwapPlayer(null);
  };

  // Export generated teams to CSV
  const handleExportBalancedCsv = () => {
    if (!balancedResult || !balancedResult.teams?.length) return;
    const lines = ['Team Number,Team Name,Player Name,Class/Category,Tier Level,Position'];
    balancedResult.teams.forEach((t, idx) => {
      const tName = (teamNames[idx] || t.name || `Team ${idx + 1}`).replace(/"/g, '""');
      t.players.forEach((p) => {
        const pName = String(p.name || '').replace(/"/g, '""');
        const tierLabel = getClassTierLabel(p.player_class, balancedResult.classes);
        lines.push(`${t.team_number},"${tName}","${pName}",${p.player_class},"${tierLabel}",${p.position || ''}`);
      });
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ruiru_titans_balanced_teams.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save balanced teams into selected existing League or Cup competition & auto-generate fixtures
  const handleSaveToActiveCategory = () => {
    if (!balancedResult || !onApplyBalancedTeamsToCategory) return;
    const finalTeams = balancedResult.teams.map((t, idx) => ({
      ...t,
      name: (teamNames[idx] || t.name || `Team ${idx + 1}`).trim(),
    }));
    const chosenKey = targetCategoryKey || activeCategoryKey || 'open';
    const chosenCat = categories[chosenKey];
    const chosenLabel = chosenCat?.label || activeCategoryLabel;
    const chosenMode = chosenCat?.mode || 'league';
    const parsedReferees = parseRefereesList(competitionRefereesInput);

    const resultInfo = onApplyBalancedTeamsToCategory(
      finalTeams,
      chosenKey,
      replaceExistingTeams,
      parsedReferees,
      competitionStartDate,
      competitionVenue.trim() || 'Thoome Pri.'
    );
    const fixtureCount = resultInfo?.fixtureCount ?? 0;

    setSavedCompetitionInfo({
      key: chosenKey,
      label: chosenLabel,
      mode: chosenMode,
      teamCount: finalTeams.length,
      fixtureCount,
    });

    setStatusMsg(
      `🏆 Saved ${finalTeams.length} balanced teams (${finalTeams.map((t) => t.name).join(', ')}) to "${chosenLabel}" (${chosenMode === 'cup' ? 'Cup' : 'League'}), automatically generated ${fixtureCount} fixtures at "${competitionVenue.trim() || 'Thoome Pri.'}" with randomized referees, and opened competition-specific player voting!`
    );
  };

  const handleCreateNewCategoryFromTeams = (e) => {
    e.preventDefault();
    if (!balancedResult || !onCreateCategoryWithBalancedTeams) return;
    const mode = newCategoryType === 'cup' ? 'cup' : 'league';
    const format = newCategoryType === 'league-single' ? 'single' : 'double';
    const defaultTitle =
      mode === 'cup'
        ? `Balanced Knockout Cup (${balancedResult.teams.length} Teams)`
        : `Balanced League (${balancedResult.teams.length} Teams)`;
    const title = newCategoryTitle.trim() || defaultTitle;
    const finalTeams = balancedResult.teams.map((t, idx) => ({
      ...t,
      name: (teamNames[idx] || t.name || `Team ${idx + 1}`).trim(),
    }));
    const parsedReferees = parseRefereesList(competitionRefereesInput);

    const createdInfo = onCreateCategoryWithBalancedTeams(
      title,
      finalTeams,
      mode,
      format,
      parsedReferees,
      competitionStartDate,
      competitionVenue.trim() || 'Thoome Pri.'
    );
    setNewCategoryTitle('');

    const createdKey = createdInfo?.key || activeCategoryKey;
    const fixtureCount = createdInfo?.fixtureCount ?? 0;
    setTargetCategoryKey(createdKey);
    setSavedCompetitionInfo({
      key: createdKey,
      label: title,
      mode,
      teamCount: finalTeams.length,
      fixtureCount,
    });

    setStatusMsg(
      `🏆 Created new ${mode === 'cup' ? 'Cup' : 'League'} competition "${title}" with ${finalTeams.length} balanced teams, generated ${fixtureCount} fixtures with randomized referees${mode === 'cup' ? ' + Knockout Bracket' : ''}, and activated competition voting!`
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER BANNER */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F2E24 0%, #091F18 100%)',
          border: '1px solid #C9A227',
          borderRadius: '14px',
          padding: '20px 22px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{
                background: 'rgba(201, 162, 39, 0.2)',
                border: '1px solid #C9A227',
                color: '#C9A227',
                fontSize: '10.5px',
                fontWeight: 800,
                padding: '2px 10px',
                borderRadius: '999px',
                letterSpacing: '0.1em',
              }}
            >
              ⚖️ STRATIFIED SQUAD BALANCER
            </span>
            <span style={{ fontSize: '11.5px', color: '#6CE5A0', fontWeight: 700 }}>
              Class A (Elite ★) → Class {distinctClasses[distinctClasses.length - 1] || 'D'} (Amateur)
            </span>
          </div>
          <h2 className="scoreboard" style={{ color: '#F4F2EA', fontSize: '28px', margin: '2px 0 4px' }}>
            AUTOMATIC TEAM BALANCER &amp; DRAFT GENERATOR
          </h2>
          <p style={{ color: '#8FA89B', fontSize: '12.5px', margin: 0, maxWidth: '720px', lineHeight: 1.5 }}>
            Import players with their skill class/category (<strong>A, B, C…</strong> from <strong>A = Elite</strong> down to the last letter = <strong>Amateur</strong>) via <strong>Excel (.xlsx)</strong>, <strong>CSV</strong>, <strong>Table Paste</strong>, or a <strong>Google Sheet Link</strong>. Set the number of players per team, generate balanced squads across all categories, and assign each team its official name.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            style={{
              background: '#16352A',
              color: '#DDE6DF',
              border: '1px solid #2B5746',
              borderRadius: '8px',
              padding: '9px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ⬇️ Download Sample CSV Template
          </button>
          <button
            type="button"
            onClick={() => {
              const sample = extractPlayersFromRows(parseTabularText(SAMPLE_PLAYERS_CSV));
              setPlayers(sample);
              setRawPasteText(SAMPLE_PLAYERS_CSV);
              setBalancedResult(null);
              setStatusMsg('✅ Loaded 24 sample Ruiru Titans players across Classes A, B, C, and D.');
            }}
            style={{
              background: 'rgba(201, 162, 39, 0.18)',
              color: '#C9A227',
              border: '1px solid #C9A227',
              borderRadius: '8px',
              padding: '9px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            ⚡ Load Sample Roster (A–D)
          </button>
        </div>
      </div>

      {/* STATUS & ERROR BANNERS */}
      {errorMsg && (
        <div
          style={{
            background: 'rgba(226, 74, 59, 0.16)',
            border: '1px solid #E24A3B',
            color: '#FF9990',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>⚠️ {errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            style={{ background: 'none', border: 'none', color: '#FF9990', cursor: 'pointer', fontWeight: 800 }}
          >
            ✕
          </button>
        </div>
      )}

      {statusMsg && (
        <div
          style={{
            background: '#123D2E',
            border: '1px solid #2F7D5C',
            color: '#6CE5A0',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            style={{ background: 'none', border: 'none', color: '#6CE5A0', cursor: 'pointer', fontWeight: 800 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* STEP 1 & STEP 2 GRID: DATA INPUT + BALANCING CONTROLS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '18px',
          alignItems: 'start',
        }}
      >
        {/* STEP 1: IMPORT PLAYERS (EXCEL, CSV, GOOGLE SHEET, OR TABLE PASTE) */}
        <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '12px', padding: '18px' }}>
          <div className="scoreboard" style={{ color: '#C9A227', fontSize: '20px', marginBottom: '10px' }}>
            1. IMPORT PLAYER ROSTER &amp; CLASSES (A, B, C…)
          </div>

          {/* Input Mode Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              background: '#08231B',
              padding: '5px',
              borderRadius: '10px',
              border: '1px solid #16352A',
              marginBottom: '14px',
              flexWrap: 'wrap',
            }}
          >
            {[
              { key: 'upload', label: '📁 Excel / CSV File' },
              { key: 'gsheet', label: '🔗 Google Sheet Link' },
              { key: 'paste', label: '📋 Paste Table / CSV' },
              { key: 'gform', label: '📝 Google Form & Sheet Setup' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setInputMode(t.key);
                  setErrorMsg(null);
                }}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '12px',
                  background: inputMode === t.key ? '#C9A227' : 'transparent',
                  color: inputMode === t.key ? '#16201B' : '#8FA89B',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB A: EXCEL / CSV UPLOAD */}
          {inputMode === 'upload' && (
            <div
              style={{
                background: '#08231B',
                border: '1px dashed #2B5746',
                borderRadius: '10px',
                padding: '18px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>📊</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#F4F2EA', marginBottom: '4px' }}>
                Upload Excel (.xlsx) or CSV (.csv / .tsv) File
              </div>
              <div style={{ fontSize: '11.5px', color: '#8FA89B', marginBottom: '14px' }}>
                File should contain columns for <strong>Player Name</strong> and <strong>Class / Category</strong> (<code>A</code> = Elite, <code>B</code>, <code>C</code>, <code>D</code>… down to Amateur).
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                onChange={handleFileChange}
                className="form-input"
                style={{ maxWidth: '340px', margin: '0 auto', padding: '8px', cursor: 'pointer' }}
              />
              {uploadedFileName && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#6CE5A0', fontWeight: 700 }}>
                  📄 Selected file: {uploadedFileName}
                </div>
              )}
            </div>
          )}

          {/* TAB B: GOOGLE SHEET LINK */}
          {inputMode === 'gsheet' && (
            <form
              onSubmit={handleFetchGoogleSheet}
              style={{
                background: '#08231B',
                border: '1px solid #16352A',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#DDE6DF' }}>
                Paste Google Sheet Link (Share setting: &ldquo;Anyone with the link&rdquo;)
              </label>
              <input
                type="url"
                className="form-input"
                value={googleSheetUrl}
                onChange={(e) => setGoogleSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
                required
              />
              <div style={{ fontSize: '11px', color: '#8FA89B', lineHeight: 1.4 }}>
                Supports standard Google Sheets links (<code>/spreadsheets/d/.../edit</code>), specific sheet tabs (<code>#gid=...</code>), and published CSV links.
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: '#C9A227',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                {loading ? 'Fetching Google Sheet…' : '🌐 Fetch Players from Google Sheet'}
              </button>
            </form>
          )}

          {/* TAB C: PASTE TABLE / CSV */}
          {inputMode === 'paste' && (
            <div
              style={{
                background: '#08231B',
                border: '1px solid #16352A',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#DDE6DF' }}>
                Paste Spreadsheet Cells (from Excel / Google Sheets) or CSV Rows
              </label>
              <textarea
                rows={7}
                className="form-input"
                value={rawPasteText}
                onChange={(e) => setRawPasteText(e.target.value)}
                placeholder={'Player Name, Class\nPato, A\nKim, A\nMrefu, B\nFidel, C'}
                style={{ fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
              />
              <button
                type="button"
                onClick={handleParsePastedText}
                style={{
                  background: '#C9A227',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                📥 Parse Table / CSV into Player List
              </button>
            </div>
          )}

          {/* TAB D: CONNECTED GOOGLE FORM & SHEET */}
          {inputMode === 'gform' && (
            <div
              style={{
                background: '#08231B',
                border: '1px solid #16352A',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Form & Sheet Architecture Card */}
              <div
                style={{
                  background: 'rgba(201, 162, 39, 0.08)',
                  border: '1px solid rgba(201, 162, 39, 0.3)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>📝</span>
                  <span style={{ color: '#F4F2EA', fontWeight: 800, fontSize: '13px' }}>
                    Connected Google Form &amp; Sheet with Dropdowns
                  </span>
                </div>
                <div style={{ color: '#8FA89B', fontSize: '11.5px', lineHeight: 1.5 }}>
                  The connected Google Form collects:
                  <ul style={{ margin: '6px 0 6px 18px', padding: 0 }}>
                    <li><strong>Player Name</strong>: Text entry (e.g. <code>Patrick Kamau</code>)</li>
                    <li><strong>Position</strong>: Dropdown menu (<code>GK</code>, <code>LB</code>, <code>CB</code>, <code>RB</code>, <code>CDM</code>, <code>CM</code>, <code>LW</code>, <code>RW</code>, <code>ST</code>)</li>
                    <li><strong>Category</strong>: Dropdown menu (<code>A — Elite</code>, <code>B — Advanced</code>, <code>C — Intermediate</code>, <code>D — Amateur</code>, <code>E — Novice</code>)</li>
                  </ul>
                  Responses are stored directly in a connected Google Spreadsheet with pre-configured dropdown data validation rules on every row.
                </div>
              </div>

              {/* Step 1: 1-Click Google Apps Script Generator */}
              <div
                style={{
                  background: '#0F2E24',
                  border: '1px solid #1E4636',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#C9A227' }}>
                    ⚡ 1-Click Automated Form &amp; Sheet Setup Script
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleCopyScript}
                      style={{
                        background: copiedScript ? '#2E8B57' : '#C9A227',
                        color: '#16201B',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedScript ? '✅ Copied to Clipboard!' : '📋 Copy Setup Script'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadScript}
                      style={{
                        background: '#16352A',
                        color: '#DDE6DF',
                        border: '1px solid #2B5746',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ⬇️ Download .gs Script
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowScriptCode((prev) => !prev)}
                      style={{
                        background: 'transparent',
                        color: '#8FA89B',
                        border: '1px solid #2B5746',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '11.5px',
                        cursor: 'pointer',
                      }}
                    >
                      {showScriptCode ? 'Hide Code' : 'View Code'}
                    </button>
                  </div>
                </div>

                <div style={{ color: '#8FA89B', fontSize: '11px', lineHeight: 1.4 }}>
                  <strong>How to run:</strong> Open <a href="https://script.google.com/" target="_blank" rel="noreferrer" style={{ color: '#6CE5A0', textDecoration: 'underline' }}>script.google.com</a>, create a New Project, paste this script, and click <strong>Run</strong>. Google will automatically create your Form and connected Sheet, setting up the exact dropdown fields.
                </div>

                {showScriptCode && (
                  <pre
                    style={{
                      margin: '6px 0 0',
                      background: '#041610',
                      border: '1px solid #16352A',
                      borderRadius: '6px',
                      padding: '10px',
                      color: '#A7F3D0',
                      fontSize: '10.5px',
                      lineHeight: 1.4,
                      maxHeight: '180px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {GOOGLE_APPS_SCRIPT_CONTENT}
                  </pre>
                )}
              </div>

              {/* Step 2: Paste Connected Google Sheet Link to Sync Responses */}
              <form
                onSubmit={handleFetchGoogleSheet}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  background: '#0F2E24',
                  border: '1px solid #1E4636',
                  borderRadius: '8px',
                  padding: '12px',
                }}
              >
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#DDE6DF' }}>
                  🔗 Sync Responses from Your Connected Google Sheet
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="url"
                    className="form-input"
                    value={googleSheetUrl}
                    onChange={(e) => setGoogleSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
                    style={{ flex: '1 1 240px' }}
                    required
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      background: '#C9A227',
                      color: '#16201B',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '9px 16px',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {loading ? 'Fetching Responses…' : '🌐 Import Sheet Responses into Balancer'}
                  </button>
                </div>
                <div style={{ fontSize: '10.5px', color: '#8FA89B' }}>
                  Reads all player submissions from the Google Sheet and loads them directly into the squad balancing roster.
                </div>
              </form>
            </div>
          )}

          {/* QUICK ADD PLAYER ROW */}
          <form
            onSubmit={handleAddSinglePlayer}
            style={{
              marginTop: '14px',
              paddingTop: '14px',
              borderTop: '1px solid #16352A',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ flex: '2 1 140px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#8FA89B', marginBottom: '4px' }}>
                Add Player Name
              </label>
              <input
                type="text"
                className="form-input"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="e.g. Oti"
              />
            </div>
            <div style={{ flex: '1 1 80px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#8FA89B', marginBottom: '4px' }}>
                Class (A–Z)
              </label>
              <input
                type="text"
                maxLength={1}
                className="form-input"
                value={newPlayerClass}
                onChange={(e) => setNewPlayerClass(e.target.value.toUpperCase())}
                placeholder="A"
                style={{ textAlign: 'center', fontWeight: 800 }}
              />
            </div>
            <div style={{ flex: '1 1 85px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#8FA89B', marginBottom: '4px' }}>
                Position
              </label>
              <select
                className="form-input"
                value={newPlayerPosition}
                onChange={(e) => setNewPlayerPosition(e.target.value)}
              >
                <option value="">-- Unassigned --</option>
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              style={{
                background: '#16352A',
                color: '#6CE5A0',
                border: '1px solid #2F7D5C',
                borderRadius: '8px',
                padding: '9px 14px',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              + Add Player
            </button>
          </form>
        </div>

        {/* STEP 2: TEAM SIZE & BALANCING CONFIGURATION */}
        <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '12px', padding: '18px' }}>
          <div className="scoreboard" style={{ color: '#C9A227', fontSize: '20px', marginBottom: '10px' }}>
            2. SET PLAYERS PER TEAM &amp; GENERATE BALANCED SQUADS
          </div>

          <div
            style={{
              background: '#08231B',
              border: '1px solid #16352A',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '14px',
            }}
          >
            <label
              htmlFor="players-per-team-input"
              style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#F4F2EA', marginBottom: '8px' }}
            >
              Number of Players in Each Team
            </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                id="players-per-team-input"
                type="number"
                min={1}
                max={50}
                className="form-input"
                value={playersPerTeam}
                onChange={(e) => setPlayersPerTeam(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ width: '110px', fontSize: '16px', fontWeight: 800, textAlign: 'center', color: '#C9A227' }}
              />
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[5, 6, 7, 8, 11].map((presetSize) => (
                  <button
                    key={presetSize}
                    type="button"
                    onClick={() => setPlayersPerTeam(presetSize)}
                    style={{
                      background: Number(playersPerTeam) === presetSize ? '#C9A227' : '#113328',
                      color: Number(playersPerTeam) === presetSize ? '#16201B' : '#DDE6DF',
                      border: '1px solid #2B5746',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {presetSize}-a-side
                  </button>
                ))}
              </div>
            </div>

            {/* Summary Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginTop: '14px',
                paddingTop: '12px',
                borderTop: '1px solid #16352A',
              }}
            >
              <div style={{ background: '#0B2B21', padding: '8px 10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '10.5px', color: '#8FA89B', fontWeight: 700 }}>TOTAL PLAYERS</div>
                <div className="scoreboard" style={{ fontSize: '22px', color: '#F4F2EA' }}>
                  {players.length}
                </div>
              </div>
              <div style={{ background: '#0B2B21', padding: '8px 10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '10.5px', color: '#8FA89B', fontWeight: 700 }}>PLAYERS / TEAM</div>
                <div className="scoreboard" style={{ fontSize: '22px', color: '#C9A227' }}>
                  {playersPerTeam}
                </div>
              </div>
              <div style={{ background: '#0B2B21', padding: '8px 10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '10.5px', color: '#8FA89B', fontWeight: 700 }}>TEAMS FORMED</div>
                <div className="scoreboard" style={{ fontSize: '22px', color: '#6CE5A0' }}>
                  {estimatedTeamCount}
                </div>
              </div>
            </div>
          </div>

          {/* Detected Class Tiers Breakdown */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#8FA89B', marginBottom: '8px', textTransform: 'uppercase' }}>
              Detected Skill Categories (A = Elite down to {distinctClasses[distinctClasses.length - 1] || 'Last'} = Amateur)
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {distinctClasses.map((cls) => {
                const style = getClassBadgeStyle(cls, distinctClasses);
                const tierLabel = getClassTierLabel(cls, distinctClasses);
                return (
                  <div
                    key={cls}
                    style={{
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                      color: style.color,
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>Class {cls}</span>
                    <span style={{ opacity: 0.85, fontSize: '11px', fontWeight: 600 }}>({tierLabel})</span>
                    <span
                      style={{
                        background: 'rgba(0,0,0,0.35)',
                        padding: '1px 7px',
                        borderRadius: '999px',
                        fontSize: '11px',
                      }}
                    >
                      {classCountsSummary[cls] || 0} players
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handleGenerateBalancedTeams}
            style={{
              width: '100%',
              background: '#C9A227',
              color: '#16201B',
              border: 'none',
              borderRadius: '10px',
              padding: '13px 18px',
              fontSize: '14px',
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(201, 162, 39, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            ⚖️ {balancedResult ? 'Re-Balance / Re-Shuffle Teams' : 'Balance Players into Teams'}
          </button>
        </div>
      </div>

      {/* STEP 3: GENERATED BALANCED TEAMS & TEAM NAME ASSIGNMENT */}
      {balancedResult && balancedResult.teams && (
        <div
          style={{
            background: '#0F2E24',
            border: '2px solid #C9A227',
            borderRadius: '14px',
            padding: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid #1E4636',
            }}
          >
            <div>
              <div className="scoreboard" style={{ color: '#C9A227', fontSize: '24px' }}>
                3. BALANCED TEAMS — ASSIGN TEAM NAMES ({balancedResult.teams.length} TEAMS)
              </div>
              <div style={{ fontSize: '12px', color: '#8FA89B' }}>
                Each team below has an equal distribution of players from Classes{' '}
                <strong>{balancedResult.classes.join(', ')}</strong>. Type a custom <strong>Team Name</strong> for each squad or click any two players to swap them.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleAssignPresetNames}
                style={{
                  background: '#16352A',
                  color: '#C9A227',
                  border: '1px solid #C9A227',
                  borderRadius: '8px',
                  padding: '8px 13px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🏷️ Auto-Fill Club Names
              </button>
              <button
                type="button"
                onClick={handleExportBalancedCsv}
                style={{
                  background: '#16352A',
                  color: '#6CE5A0',
                  border: '1px solid #2F7D5C',
                  borderRadius: '8px',
                  padding: '8px 13px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                📥 Export Balanced Teams (CSV)
              </button>
              {onApplyBalancedTeamsToCategory && (
                <button
                  type="button"
                  onClick={handleSaveToActiveCategory}
                  style={{
                    background: '#C9A227',
                    color: '#16201B',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  💾 Save Teams to &ldquo;{activeCategoryLabel}&rdquo;
                </button>
              )}
            </div>
          </div>

          {/* Quick-Add Player directly to Balanced Teams without Reshuffling */}
          <div
            style={{
              background: '#082018',
              border: '1px solid #1E4636',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>⚡</span>
              <div>
                <strong style={{ fontSize: '13px', color: '#6CE5A0' }}>
                  Intelligently Add Player(s) to Squads
                </strong>
                <div style={{ fontSize: '11px', color: '#8FA89B' }}>
                  New arrivals are automatically placed on the best squad to preserve equal size & skill balance without reshuffling.
                </div>
              </div>
            </div>

            <form
              onSubmit={handleQuickAddPlayerToBalancedTeams}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                alignItems: 'center',
                flex: '1 1 auto',
                justifyContent: 'flex-end',
              }}
            >
              <input
                type="text"
                className="form-input"
                style={{ minWidth: '150px', flex: '1 1 150px', padding: '6px 10px', fontSize: '12px' }}
                placeholder="Player name(s) (e.g. Oti, Kamau)"
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
              />
              <input
                type="text"
                maxLength={1}
                className="form-input"
                style={{ width: '48px', padding: '6px', textAlign: 'center', fontWeight: 800, fontSize: '12px' }}
                placeholder="Class"
                title="Skill Tier Class (A = Elite, down to Z = Amateur)"
                value={quickAddClass}
                onChange={(e) => setQuickAddClass(e.target.value.toUpperCase())}
              />
              <select
                className="form-input"
                style={{ width: '92px', padding: '6px 8px', fontSize: '12px' }}
                value={quickAddPosition}
                onChange={(e) => setQuickAddPosition(e.target.value)}
              >
                <option value="">-- Pos --</option>
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
              <select
                className="form-input"
                style={{ width: '185px', padding: '6px 8px', fontSize: '12px' }}
                value={quickAddTargetTeam}
                onChange={(e) => setQuickAddTargetTeam(e.target.value)}
              >
                <option value="__auto__">⚡ Auto-Assign (Balanced)</option>
                {(balancedResult.teams || []).map((t, tIdx) => {
                  const assignedName = teamNames[tIdx] ?? t.name ?? `Team ${tIdx + 1}`;
                  return (
                    <option key={t.id || tIdx} value={String(tIdx)}>
                      Direct to {assignedName}
                    </option>
                  );
                })}
              </select>
              <button
                type="submit"
                style={{
                  background: '#16352A',
                  color: '#6CE5A0',
                  border: '1px solid #2F7D5C',
                  borderRadius: '6px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                + Add to Squads
              </button>
            </form>
          </div>

          {/* Balanced Team Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(275px, 1fr))',
              gap: '16px',
            }}
          >
            {balancedResult.teams.map((team, tIdx) => {
              const assignedName = teamNames[tIdx] ?? team.name ?? `Team ${tIdx + 1}`;
              return (
                <div
                  key={team.id || tIdx}
                  style={{
                    background: '#08231B',
                    border: `1px solid ${team.color || '#2B5746'}`,
                    borderTop: `4px solid ${team.color || '#C9A227'}`,
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {/* Editable Team Name Input */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '5px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 800,
                          color: team.color || '#C9A227',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        SQUAD #{team.team_number} · ASSIGN TEAM NAME
                      </span>
                      <span style={{ fontSize: '11px', color: '#8FA89B', fontWeight: 700 }}>
                        {team.players.length} / {balancedResult.players_per_team} Players
                      </span>
                    </div>
                    <input
                      type="text"
                      className="form-input"
                      value={assignedName}
                      onChange={(e) => handleTeamNameChange(tIdx, e.target.value)}
                      placeholder={`Enter name for Team ${tIdx + 1}…`}
                      aria-label={`Assign name for Team ${tIdx + 1}`}
                      style={{
                        fontWeight: 800,
                        fontSize: '15px',
                        color: '#F4F2EA',
                        borderColor: team.color || '#C9A227',
                        background: '#0D2E23',
                      }}
                    />
                  </div>

                  {/* Category Distribution Pills & Skill Score */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '5px',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#0B2B21',
                      padding: '7px 10px',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {balancedResult.classes.map((cls) => {
                        const badge = getClassBadgeStyle(cls, balancedResult.classes);
                        return (
                          <span
                            key={cls}
                            style={{
                              background: badge.bg,
                              border: `1px solid ${badge.border}`,
                              color: badge.color,
                              fontSize: '10.5px',
                              fontWeight: 800,
                              padding: '1px 7px',
                              borderRadius: '999px',
                            }}
                          >
                            {cls}: {team.class_counts?.[cls] || 0}
                          </span>
                        );
                      })}
                    </div>
                    <span style={{ fontSize: '11px', color: '#6CE5A0', fontWeight: 700 }}>
                      Rating: {team.total_skill_score} pts (Avg {team.average_skill_score})
                    </span>
                  </div>

                  {/* Inline Direct Add Player to this Team */}
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="+ Player name…"
                      style={{ flex: 1, padding: '4px 8px', fontSize: '11px' }}
                      value={cardInlineAddName[tIdx] || ''}
                      onChange={(e) => setCardInlineAddName({ ...cardInlineAddName, [tIdx]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const n = (cardInlineAddName[tIdx] || '').trim();
                          if (!n) return;
                          handleDirectAddPlayersToTeam(tIdx, [{
                            name: n,
                            player_class: cardInlineAddClass[tIdx] || 'B',
                            position: cardInlineAddPos[tIdx] || '',
                          }]);
                          setCardInlineAddName({ ...cardInlineAddName, [tIdx]: '' });
                        }
                      }}
                    />
                    <select
                      className="form-input"
                      style={{ width: '48px', padding: '4px 2px', fontSize: '10.5px' }}
                      value={cardInlineAddClass[tIdx] || 'B'}
                      onChange={(e) => setCardInlineAddClass({ ...cardInlineAddClass, [tIdx]: e.target.value })}
                    >
                      {balancedResult.classes.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      className="form-input"
                      style={{ width: '64px', padding: '4px 2px', fontSize: '10.5px' }}
                      value={cardInlineAddPos[tIdx] || ''}
                      onChange={(e) => setCardInlineAddPos({ ...cardInlineAddPos, [tIdx]: e.target.value })}
                    >
                      <option value="">-- Pos --</option>
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const n = (cardInlineAddName[tIdx] || '').trim();
                        if (!n) return;
                        handleDirectAddPlayersToTeam(tIdx, [{
                          name: n,
                          player_class: cardInlineAddClass[tIdx] || 'B',
                          position: cardInlineAddPos[tIdx] || '',
                        }]);
                        setCardInlineAddName({ ...cardInlineAddName, [tIdx]: '' });
                      }}
                      style={{
                        background: '#C9A227',
                        color: '#16201B',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '5px 8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      + Add
                    </button>
                  </div>

                  {/* Players List in Team */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {team.players.map((p, pIdx) => {
                      const badge = getClassBadgeStyle(p.player_class, balancedResult.classes);
                      const isSelectedForSwap =
                        selectedSwapPlayer &&
                        selectedSwapPlayer.teamIdx === tIdx &&
                        selectedSwapPlayer.playerIdx === pIdx;
                      return (
                        <div
                          key={p.id || `${tIdx}-${pIdx}`}
                          onClick={() => handleSwapClick(tIdx, pIdx)}
                          title="Click to select player and swap with another team's player"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: isSelectedForSwap ? 'rgba(201, 162, 39, 0.25)' : '#0D2E23',
                            border: isSelectedForSwap ? '1px solid #C9A227' : '1px solid #163E31',
                            borderRadius: '8px',
                            padding: '7px 10px',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '6px',
                                background: badge.bg,
                                border: `1px solid ${badge.border}`,
                                color: badge.color,
                                fontSize: '11px',
                                fontWeight: 900,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {p.player_class}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#F4F2EA' }}>
                              {p.name}
                            </span>
                            {p.is_newly_added && (
                              <span
                                style={{
                                  fontSize: '9px',
                                  color: '#6CE5A0',
                                  background: 'rgba(108,229,160,0.18)',
                                  border: '1px solid #2F7D5C',
                                  borderRadius: '4px',
                                  padding: '1px 5px',
                                  fontWeight: 800,
                                }}
                                title="Intelligently placed to preserve team balance without reshuffling"
                              >
                                Added
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <select
                              value={p.position || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                const newPos = e.target.value;
                                setBalancedResult((prev) => {
                                  if (!prev || !prev.teams) return prev;
                                  const nextTeams = prev.teams.map((teamItem, tIndex) => {
                                    if (tIndex !== tIdx) return teamItem;
                                    return {
                                      ...teamItem,
                                      players: teamItem.players.map((pItem, pIndex) =>
                                        pIndex === pIdx ? { ...pItem, position: newPos } : pItem
                                      ),
                                    };
                                  });
                                  return { ...prev, teams: nextTeams };
                                });
                              }}
                              style={{
                                fontSize: '10.5px',
                                color: p.position ? '#C9A227' : '#9CA3AF',
                                background: p.position ? '#082018' : '#1F2937',
                                border: p.position ? '1px solid #1E4637' : '1px dashed #6B7280',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              title="Click to manually assign or change player's position"
                            >
                              <option value="">-- Unassigned --</option>
                              {POSITIONS.filter(Boolean).map((pos) => (
                                <option key={pos} value={pos}>
                                  {pos}
                                </option>
                              ))}
                            </select>
                            {balancedResult.teams.length > 1 && (
                              <select
                                value=""
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const targetIdx = parseInt(e.target.value, 10);
                                  if (!isNaN(targetIdx) && targetIdx !== tIdx) {
                                    handleMoveBalancedPlayer(tIdx, targetIdx, pIdx);
                                  }
                                }}
                                title={`Move ${p.name} to another balanced team`}
                                style={{
                                  fontSize: '10px',
                                  color: '#6CE5A0',
                                  background: '#0B2920',
                                  border: '1px solid #2B5746',
                                  padding: '2px 4px',
                                  borderRadius: '4px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                <option value="" disabled>⇄ Move...</option>
                                {balancedResult.teams.map((otherTeam, otherIdx) => {
                                  if (otherIdx === tIdx) return null;
                                  const otherName = teamNames[otherIdx] ?? otherTeam.name ?? `Team ${otherIdx + 1}`;
                                  return (
                                    <option key={otherIdx} value={String(otherIdx)}>
                                      → {otherName}
                                    </option>
                                  );
                                })}
                              </select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* STEP 4: LAUNCH COMPETITION WORKFLOW — GENERATE FIXTURES & ACTIVATE COMPETITION VOTING */}
          <div
            style={{
              marginTop: '20px',
              padding: '18px',
              background: '#08231B',
              border: '1px solid #C9A227',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div>
              <div className="scoreboard" style={{ color: '#C9A227', fontSize: '21px' }}>
                4. LAUNCH COMPETITION WORKFLOW — GENERATE FIXTURES, RANDOMIZE REFEREES &amp; OPEN PLAYER VOTING
              </div>
              <div style={{ fontSize: '12px', color: '#9BB5A8', marginTop: '2px' }}>
                Once your balanced teams and custom team names are ready, enter your competition referees and apply the teams to a specific <strong>League</strong> or <strong>Cup</strong> competition below. The system will automatically generate the competition&apos;s fixtures (or Cup Groups + Knockout Bracket), randomly assign referees across all unplayed matches, assign Permanent Player IDs, and open player voting under that specific competition.
              </div>
            </div>

            {/* Competition Referees Form Input */}
            <div
              style={{
                background: '#0D2E23',
                border: '1px solid #2A5A46',
                borderRadius: '10px',
                padding: '12px 14px',
              }}
            >
              <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#C9A227', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🧑‍⚖️ Competition Referees Pool (Comma-Separated — Automatically Randomized Across Generated Fixtures)
              </label>
              <input
                type="text"
                className="form-input"
                value={competitionRefereesInput}
                onChange={(e) => setCompetitionRefereesInput(e.target.value)}
                placeholder="e.g. Ref Kamau, Ref Otieno, Ref Njoroge, Ref Mwangi"
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '11px', color: '#8FA89B', marginTop: '4px' }}>
                These referees will be saved to the competition and randomly assigned to all generated fixtures. Managers can also change the referee for any unplayed fixture at any time.
              </div>
            </div>

            {/* Competition Scheduling & Match Venue Form Inputs */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '12px',
              }}
            >
              <div
                style={{
                  background: '#0D2E23',
                  border: '1px solid #2A5A46',
                  borderRadius: '10px',
                  padding: '12px 14px',
                }}
              >
                <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#C9A227', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🗓️ Competition Fixtures Start Date (Optional)
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={competitionStartDate}
                  onChange={(e) => setCompetitionStartDate(e.target.value)}
                  style={{ width: '160px' }}
                  title="Kickoff date for generated fixtures"
                />
                <div style={{ fontSize: '11px', color: '#8FA89B', marginTop: '4px' }}>
                  Set the kickoff date for the first match day. If left blank, it defaults to the upcoming enabled match day from today.
                </div>
              </div>

              <div
                style={{
                  background: '#0D2E23',
                  border: '1px solid #2A5A46',
                  borderRadius: '10px',
                  padding: '12px 14px',
                }}
              >
                <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#C9A227', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🏟️ Match Venue
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={competitionVenue}
                  onChange={(e) => setCompetitionVenue(e.target.value)}
                  placeholder="e.g. Thoome Pri."
                  style={{ width: '100%', maxWidth: '280px', fontWeight: 700 }}
                  title="Primary match venue for this competition"
                />
                <div style={{ fontSize: '11px', color: '#8FA89B', marginTop: '4px' }}>
                  Primary match ground for this competition (defaults to <strong>Thoome Pri.</strong>, editable here).
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                gap: '16px',
              }}
            >
              {/* Option A: Apply to an Existing League or Cup Competition */}
              {onApplyBalancedTeamsToCategory && (
                <div
                  style={{
                    background: '#0D2E23',
                    border: '1px solid #1E4636',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#6CE5A0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Option A · Apply to Existing League or Cup Competition
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#8FA89B', display: 'block', marginBottom: '4px' }}>
                      Select Target Competition
                    </label>
                    <select
                      className="form-input"
                      value={targetCategoryKey}
                      onChange={(e) => setTargetCategoryKey(e.target.value)}
                      style={{ width: '100%', fontWeight: 700 }}
                    >
                      {Object.keys(categories).length > 0 ? (
                        Object.entries(categories).map(([k, c]) => (
                          <option key={k} value={k}>
                            {c.mode === 'cup' ? '🏆 Cup: ' : '📊 League: '}
                            {c.label} ({(c.teams || []).length} teams)
                          </option>
                        ))
                      ) : (
                        <option value={activeCategoryKey}>{activeCategoryLabel}</option>
                      )}
                    </select>
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11.5px',
                      color: '#DDE6DF',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={replaceExistingTeams}
                      onChange={(e) => setReplaceExistingTeams(e.target.checked)}
                    />
                    <span>
                      Replace existing teams in this competition &amp; generate fresh fixtures
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleSaveToActiveCategory}
                    style={{
                      marginTop: 'auto',
                      background: '#C9A227',
                      color: '#16201B',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '12.5px',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    🚀 Save Teams &amp; Generate Fixtures for &ldquo;{categories[targetCategoryKey]?.label || activeCategoryLabel}&rdquo;
                  </button>
                </div>
              )}

              {/* Option B: Create a Brand-New League or Cup Competition */}
              {onCreateCategoryWithBalancedTeams && (
                <form
                  onSubmit={handleCreateNewCategoryFromTeams}
                  style={{
                    background: '#0D2E23',
                    border: '1px solid #1E4636',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Option B · Start a New League or Cup Competition
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#8FA89B', display: 'block', marginBottom: '4px' }}>
                        New Competition Name
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={newCategoryTitle}
                        onChange={(e) => setNewCategoryTitle(e.target.value)}
                        placeholder="e.g. Weekend Balanced Cup…"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#8FA89B', display: 'block', marginBottom: '4px' }}>
                        Competition Type &amp; Fixtures
                      </label>
                      <select
                        className="form-input"
                        value={newCategoryType}
                        onChange={(e) => setNewCategoryType(e.target.value)}
                        style={{ fontWeight: 700 }}
                      >
                        <option value="league-double">📊 League (Double Round-Robin)</option>
                        <option value="league-single">📊 League (Single Round-Robin)</option>
                        <option value="cup">🏆 Knockout Cup (Groups + QF/SF/Final)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#8FA89B', display: 'block', marginBottom: '4px' }}>
                      Match Venue (Ground)
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={competitionVenue}
                      onChange={(e) => setCompetitionVenue(e.target.value)}
                      placeholder="e.g. Thoome Pri."
                      style={{ width: '100%', fontWeight: 700 }}
                    />
                  </div>
                  <div style={{ fontSize: '11px', color: '#8FA89B' }}>
                    Automatically creates the competition, generates all fixtures, and opens TOTW/TOTT voting for these players.
                  </div>
                  <button
                    type="submit"
                    style={{
                      marginTop: 'auto',
                      background: '#2E8B57',
                      color: '#F4F2EA',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '12.5px',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    ➕ Create {newCategoryType === 'cup' ? 'Cup' : 'League'} Competition &amp; Generate Fixtures
                  </button>
                </form>
              )}
            </div>

            {/* Post-Save Quick Workflow Navigation Bar */}
            {savedCompetitionInfo && onNavigateToCompetitionView && (
              <div
                style={{
                  background: 'rgba(46, 139, 87, 0.2)',
                  border: '1px solid #34D399',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#6EE7B7' }}>
                    ✅ &ldquo;{savedCompetitionInfo.label}&rdquo; Ready — {savedCompetitionInfo.teamCount} Balanced Teams &amp; {savedCompetitionInfo.fixtureCount} Generated Fixtures
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#DDE6DF' }}>
                    Proceed to the next competition processes for <strong>{savedCompetitionInfo.label}</strong>:
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => onNavigateToCompetitionView('fixtures', savedCompetitionInfo.key)}
                    style={{
                      background: '#C9A227',
                      color: '#16201B',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    ⚽ View Generated Fixtures ({savedCompetitionInfo.fixtureCount})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigateToCompetitionView(
                        savedCompetitionInfo.mode === 'cup' ? 'cup' : 'table',
                        savedCompetitionInfo.key
                      )
                    }
                    style={{
                      background: '#16352A',
                      color: '#F4F2EA',
                      border: '1px solid #3F7A4E',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {savedCompetitionInfo.mode === 'cup' ? '🏆 View Cup Groups & Bracket' : '📊 View League Table'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateToCompetitionView('voting', savedCompetitionInfo.key)}
                    style={{
                      background: '#16352A',
                      color: '#6CE5A0',
                      border: '1px solid #C9A227',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    ⭐ Vote for Players in &ldquo;{savedCompetitionInfo.label}&rdquo;
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* INTERACTIVE PLAYER ROSTER TABLE (EDIT CLASSES A-Z OR REMOVE PLAYERS) */}
      <div style={{ background: '#0F2E24', border: '1px solid #1E4636', borderRadius: '12px', padding: '18px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <div className="scoreboard" style={{ color: '#F4F2EA', fontSize: '20px' }}>
              LOADED PLAYER POOL ({players.length} PLAYERS)
            </div>
            <div style={{ fontSize: '11.5px', color: '#8FA89B' }}>
              You can edit any player&apos;s name, class/category (<strong>A</strong> = Elite down to last letter = Amateur), or position before clicking Balance.
            </div>
          </div>
          {players.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPlayers([]);
                setBalancedResult(null);
              }}
              style={{
                background: 'rgba(178, 58, 46, 0.2)',
                color: '#FF9990',
                border: '1px solid #B23A2E',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🗑️ Clear All Players
            </button>
          )}
        </div>

        {players.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#8FA89B', fontSize: '13px' }}>
            No players loaded yet. Upload an Excel/CSV file, paste a Google Sheet link, or click &ldquo;Load Sample Roster (A–D)&rdquo; above.
          </div>
        ) : (
          <div style={{ maxHeight: '360px', overflowY: 'auto', borderRadius: '8px', border: '1px solid #16352A' }}>
            <table className="standings-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#08231B', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>#</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Player Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Class / Category (A–Z)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Tier Rank</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Position</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, idx) => {
                  const badge = getClassBadgeStyle(p.player_class, distinctClasses);
                  const tierLabel = getClassTierLabel(p.player_class, distinctClasses);
                  return (
                    <tr key={p.id || idx} style={{ borderBottom: '1px solid #133328' }}>
                      <td style={{ padding: '6px 12px', color: '#8FA89B', fontSize: '12px' }}>{idx + 1}</td>
                      <td style={{ padding: '6px 12px' }}>
                        <input
                          type="text"
                          className="form-input"
                          value={p.name}
                          onChange={(e) => handleUpdatePlayerField(p.id, 'name', e.target.value)}
                          style={{ padding: '5px 8px', fontSize: '12.5px', fontWeight: 700 }}
                        />
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                        <input
                          type="text"
                          maxLength={1}
                          className="form-input"
                          value={p.player_class}
                          onChange={(e) => handleUpdatePlayerField(p.id, 'player_class', e.target.value)}
                          style={{
                            width: '52px',
                            textAlign: 'center',
                            fontWeight: 900,
                            padding: '5px',
                            background: badge.bg,
                            borderColor: badge.border,
                            color: badge.color,
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'center', fontSize: '11.5px', color: badge.color, fontWeight: 700 }}>
                        {tierLabel}
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                        <select
                          className="form-input"
                          value={p.position || ''}
                          onChange={(e) => handleUpdatePlayerField(p.id, 'position', e.target.value)}
                          style={{ padding: '5px 8px', fontSize: '12px', width: '84px' }}
                        >
                          <option value="">--</option>
                          {POSITIONS.map((pos) => (
                            <option key={pos} value={pos}>
                              {pos}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleRemovePlayerRow(p.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#FF9990',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
