import { DEFAULT_TITANS_STATE, DEFAULT_VOTING_DATA } from "../data/defaultState";

export function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && meta.content) return meta.content;
  const cookieMatch = document.cookie.match(/csrftoken=([^;]+)/);
  if (cookieMatch) return cookieMatch[1];
  return "";
}

const PLAYER_TOKEN_KEY = "ruiru_titans_player_token";
const CMS_TOKEN_KEY = "ruiru_titans_cms_token";
const PLAYER_SESSION_KEY = "ruiru_titans_player_user";
const CMS_SESSION_KEY = "ruiru_titans_cms_user";

let memoryPlayerToken = "";
let memoryCmsToken = "";

function safeSetAuthStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    try {
      localStorage.removeItem("ruiru_titans_pending_sync");
      localStorage.removeItem("ruiru_titans_react_state");
      localStorage.setItem(key, value);
    } catch {}
  }
}

export function getPlayerToken() {
  if (memoryPlayerToken) return memoryPlayerToken;
  try {
    const stored = localStorage.getItem(PLAYER_TOKEN_KEY) || "";
    if (stored) memoryPlayerToken = stored;
    return stored;
  } catch {
    return memoryPlayerToken || "";
  }
}

export function setPlayerToken(token, userObj = null) {
  memoryPlayerToken = token || "";
  try {
    if (token) {
      safeSetAuthStorage(PLAYER_TOKEN_KEY, token);
      if (userObj) safeSetAuthStorage(PLAYER_SESSION_KEY, JSON.stringify(userObj));
    } else {
      localStorage.removeItem(PLAYER_TOKEN_KEY);
      localStorage.removeItem(PLAYER_SESSION_KEY);
    }
  } catch {}
}

export function getCmsToken() {
  if (memoryCmsToken) return memoryCmsToken;
  try {
    const stored = localStorage.getItem(CMS_TOKEN_KEY) || "";
    if (stored) memoryCmsToken = stored;
    return stored;
  } catch {
    return memoryCmsToken || "";
  }
}

export function setCmsToken(token, userObj = null) {
  memoryCmsToken = token || "";
  try {
    if (token) {
      safeSetAuthStorage(CMS_TOKEN_KEY, token);
      if (userObj) safeSetAuthStorage(CMS_SESSION_KEY, JSON.stringify(userObj));
    } else {
      localStorage.removeItem(CMS_TOKEN_KEY);
      localStorage.removeItem(CMS_SESSION_KEY);
    }
  } catch {}
}

export function clearAuthTokens() {
  setPlayerToken("");
  setCmsToken("");
  try {
    localStorage.removeItem("ruiru_titans_player_session");
  } catch {}
}

const defaultHeaders = (includeContentType = true) => {
  const headers = {
    "X-CSRFToken": getCsrfToken(),
  };
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  const pToken = getPlayerToken();
  if (pToken) headers["X-Titans-Player-Token"] = pToken;
  const cToken = getCmsToken();
  if (cToken) headers["X-Titans-CMS-Token"] = cToken;
  return headers;
};

export function sanitizeExMilitaryFixtures(state) {
  return state;
}

export const api = {
  async getState() {
    try {
      let res = await fetch("/api/state/", { headers: defaultHeaders() });
      if (res.status === 401 || res.status === 403) {
        // Bad or expired credentials in headers - clear stale tokens and retry as public visitor
        clearAuthTokens();
        res = await fetch("/api/state/", { headers: { "Content-Type": "application/json" } });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const serverData = await res.json();
      if (serverData && serverData.categories && Object.keys(serverData.categories).length > 0) {
        Object.keys(serverData.categories).forEach((k) => {
          const cat = serverData.categories[k];
          const defaultCat = DEFAULT_TITANS_STATE.categories?.[k];
          if (cat && cat.mode === "league" && Array.isArray(cat.fixtures) && defaultCat && Array.isArray(defaultCat.fixtures) && defaultCat.fixtures.length === 56) {
            const hasTbd = cat.fixtures.some((f) => f.date === "TBD" || String(f.date || "").includes("TBD"));
            if (cat.fixtures.length < 56 || hasTbd) {
              const playedMap = new Map(cat.fixtures.filter((f) => f.played || (f.events && f.events.length > 0) || f.walkover).map((f) => [f.id, f]));
              cat.fixtures = defaultCat.fixtures.map((f) => playedMap.get(f.id) || f);
            }
          }
        });
        const sanitized = sanitizeExMilitaryFixtures(serverData);
        try {
          localStorage.setItem("ruiru_titans_react_state", JSON.stringify(sanitized));
        } catch {}
        return {
          ...sanitized,
          homepage: sanitized.homepage || DEFAULT_TITANS_STATE.homepage,
          categories: {
            ...sanitized.categories,
          },
        };
      }
    } catch (err) {
      console.warn("Using embedded Ruiru Titans fallback state:", err.message);
    }
    try {
      const cached = localStorage.getItem("ruiru_titans_react_state");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.categories && Object.keys(parsed.categories).length > 0) {
          Object.keys(parsed.categories).forEach((k) => {
            const cat = parsed.categories[k];
            const defaultCat = DEFAULT_TITANS_STATE.categories?.[k];
            if (cat && cat.mode === "league" && Array.isArray(cat.fixtures) && defaultCat && Array.isArray(defaultCat.fixtures) && defaultCat.fixtures.length === 56) {
              const hasTbd = cat.fixtures.some((f) => f.date === "TBD" || String(f.date || "").includes("TBD"));
              if (cat.fixtures.length < 56 || hasTbd) {
                const playedMap = new Map(cat.fixtures.filter((f) => f.played || (f.events && f.events.length > 0) || f.walkover).map((f) => [f.id, f]));
                cat.fixtures = defaultCat.fixtures.map((f) => playedMap.get(f.id) || f);
              }
            }
          });
          const sanitizedCached = sanitizeExMilitaryFixtures(parsed);
          try {
            localStorage.setItem("ruiru_titans_react_state", JSON.stringify(sanitizedCached));
          } catch {}
          return {
            ...sanitizedCached,
            homepage: sanitizedCached.homepage || DEFAULT_TITANS_STATE.homepage,
            categories: {
              ...sanitizedCached.categories,
            },
          };
        }
      }
    } catch {}
    return sanitizeExMilitaryFixtures(DEFAULT_TITANS_STATE);
  },

  async saveState(stateData) {
    const res = await fetch("/api/state/", {
      method: "POST",
      credentials: "same-origin",
      headers: defaultHeaders(),
      body: JSON.stringify(stateData),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const err = new Error(errData.error || errData.detail || `Save failed HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  },

  async saveHomepage(homepageData) {
    const res = await fetch("/api/homepage/", {
      method: "POST",
      credentials: "same-origin",
      headers: defaultHeaders(),
      body: JSON.stringify(homepageData),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const err = new Error(errData.error || errData.detail || `Homepage save failed HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  },

  async uploadHomepageImage(fileOrDataUrl) {
    let res;
    if (typeof File !== "undefined" && fileOrDataUrl instanceof Blob) {
      const formData = new FormData();
      formData.append("file", fileOrDataUrl);
      res = await fetch("/api/homepage/upload-image/", {
        method: "POST",
        credentials: "same-origin",
        headers: defaultHeaders(false),
        body: formData,
      });
    } else {
      res = await fetch("/api/homepage/upload-image/", {
        method: "POST",
        credentials: "same-origin",
        headers: defaultHeaders(),
        body: JSON.stringify({ image: fileOrDataUrl }),
      });
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const err = new Error(errData.error || errData.detail || `Image upload failed HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  },

  async resetRealSeason() {
    try {
      const res = await fetch("/api/reset-real-season/", {
        method: "POST",
        credentials: "same-origin",
        headers: defaultHeaders(),
      });
      if (res.ok) return await res.json();
    } catch {}
    try {
      localStorage.removeItem("ruiru_titans_react_state");
    } catch {}
    return { state: DEFAULT_TITANS_STATE };
  },

  async reloadCanonicalSchedule() {
    const res = await fetch("/api/admin/reload-canonical-schedule/", {
      method: "POST",
      credentials: "same-origin",
      headers: defaultHeaders(),
    });
    if (!res.ok) throw new Error(`Schedule reload failed HTTP ${res.status}`);
    const data = await res.json();
    try {
      if (data && data.state) {
        localStorage.setItem("ruiru_titans_react_state", JSON.stringify(data.state));
      }
    } catch {}
    return data;
  },

  async getAuthSession() {
    try {
      const res = await fetch("/api/auth/session/", {
        credentials: "same-origin",
        headers: defaultHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.cms_user || data.cms) {
          const cmsObj = data.cms_user || data.cms || null;
          setPlayerToken("");
          if (data.token) {
            setCmsToken(data.token, cmsObj);
          }
          return {
            cms: cmsObj,
            player: null,
          };
        }
        if (data.player) {
          setCmsToken("");
          return {
            cms: null,
            player: data.player,
          };
        }
        clearAuthTokens();
        return {
          cms: null,
          player: null,
        };
      }
      if (res.status === 401 || res.status === 403) {
        clearAuthTokens();
      }
    } catch {}
    return { cms: null, player: null };
  },

  async loginCms(username, password) {
    clearAuthTokens();
    const cleanUser = (username || "").trim();
    const cleanPass = (password || "").trim();
    if (!cleanUser || !cleanPass) {
      throw new Error("Please enter both username and password.");
    }
    let res;
    try {
      res = await fetch("/api/auth/cms-login/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify({ username: cleanUser, password: cleanPass }),
      });
    } catch {
      clearAuthTokens();
      throw new Error("Unable to reach authentication server. Please check your connection and try again.");
    }

    if (!res.ok) {
      clearAuthTokens();
      const errData = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error(errData.error || errData.detail || "Too many login attempts. Please wait before trying again.");
      }
      throw new Error(errData.error || errData.detail || "Invalid Admin credentials.");
    }

    const data = await res.json();
    if (!data || !data.token) {
      clearAuthTokens();
      throw new Error("Invalid authentication response from server.");
    }
    setPlayerToken("");
    setCmsToken(data.token, data.cms_user);
    return data;
  },

  async loginPlayer(username, password, categoryKey = "") {
    clearAuthTokens();
    const cleanUser = (username || "").trim();
    const cleanPass = password || "";
    if (!cleanUser || !cleanPass) {
      throw new Error("Please enter your username/ID and password.");
    }
    let res;
    try {
      res = await fetch("/api/auth/player-login/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify({
          username: cleanUser,
          password: cleanPass,
          player_id: cleanUser,
          access_code: cleanPass,
          category_key: categoryKey,
        }),
      });
    } catch {
      clearAuthTokens();
      throw new Error("Unable to reach authentication server. Please check your connection and try again.");
    }

    if (!res.ok) {
      clearAuthTokens();
      const errData = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error(errData.error || errData.detail || "Too many login attempts. Please wait before trying again.");
      }
      throw new Error(errData.error || errData.detail || "Invalid player username or password.");
    }

    const data = await res.json();
    if (!data || !data.token) {
      clearAuthTokens();
      throw new Error("Invalid authentication response from server.");
    }
    setCmsToken("");
    setPlayerToken(data.token, data.player);
    return data;
  },

  async logout(role = "all") {
    if (role === "player" || role === "all") setPlayerToken("");
    if (role === "cms" || role === "all") setCmsToken("");
    try {
      const res = await fetch("/api/auth/logout/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify({ role }),
      });
      return await res.json().catch(() => ({ success: true }));
    } catch {
      return { success: true };
    }
  },

  async getH2H(catKey, team1Id, team2Id) {
    const res = await fetch(
      `/api/categories/${catKey}/h2h/?team1=${encodeURIComponent(team1Id)}&team2=${encodeURIComponent(team2Id)}`,
      { headers: defaultHeaders() }
    );
    if (!res.ok) throw new Error(`Failed to fetch H2H: ${res.status}`);
    return await res.json();
  },

  async getVotingData(catKey, voterId = "", roundId = "") {
    try {
      let url = `/api/categories/${catKey}/voting/?`;
      if (voterId) url += `voter_id=${encodeURIComponent(voterId)}&`;
      if (roundId) url += `round_id=${encodeURIComponent(roundId)}&`;
      const res = await fetch(url, { headers: defaultHeaders() });
      if (res.ok) return await res.json();
    } catch {}
    return DEFAULT_VOTING_DATA;
  },

  async submitBallot(catKey, payload) {
    const res = await fetch(`/api/categories/${catKey}/voting/submit/`, {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to submit votes: ${res.status}`);
    }
    return await res.json();
  },

  async toggleVotingRound(catKey, payload) {
    const res = await fetch(`/api/categories/${catKey}/voting/admin/toggle/`, {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Admin toggle failed: ${res.status}`);
    }
    return await res.json();
  },

  async teamBalancer(payload) {
    const res = await fetch("/api/team-balancer/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Team Balancer request failed (${res.status})`);
    }
    return await res.json();
  },

  async addPlayersToBalancedTeams(payload) {
    return await this.teamBalancer({ action: "add_players", ...payload });
  },

  async registerPlayerAdmin(payload) {
    const res = await fetch("/api/admin/players/register/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to register player (${res.status})`);
    }
    return await res.json();
  },

  async updatePlayerProfile(payload) {
    const res = await fetch("/api/players/update-profile/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to update player profile (${res.status})`);
    }
    return await res.json();
  },

  async resetPlayerPasswordAdmin(identifier, categoryKey = null, teamId = null) {
    const payload = typeof identifier === 'object' && identifier !== null
      ? identifier
      : { username: identifier, player_number: identifier, category_key: categoryKey, team_id: teamId };
    const res = await fetch("/api/admin/players/reset-password/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to reset player password (${res.status})`);
    }
    return await res.json();
  },

  async togglePlayerStatus(payload) {
    const res = await fetch("/api/admin/players/toggle-status/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to update player status (${res.status})`);
    }
    return await res.json();
  },

  async releasePlayerNumber(payload) {
    const res = await fetch("/api/admin/players/release-number/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to release player jersey number (${res.status})`);
    }
    return await res.json();
  },

  async updatePlayerPosition(payload) {
    const res = await fetch("/api/admin/players/update-position/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to update player position (${res.status})`);
    }
    return await res.json();
  },

  async updatePlayerUsername(payload) {
    const res = await fetch("/api/admin/players/update-username/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to update player username (${res.status})`);
    }
    return await res.json();
  },

  async changePlayerPassword(payload) {
    const res = await fetch("/api/auth/player-change-password/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to change password (${res.status})`);
    }
    const data = await res.json();
    if (data.token) {
      setCmsToken("");
      setPlayerToken(data.token, data.player);
    }
    return data;
  },

  async changeCmsPassword(payload) {
    const res = await fetch("/api/auth/cms-change-password/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || `Failed to change manager password (${res.status})`);
    }
    const data = await res.json();
    if (data.token) {
      setCmsToken(data.token, data.cms_user);
    }
    return data;
  },

  setPlayerToken,
  getPlayerToken,
  setCmsToken,
  getCmsToken,
  clearAuthTokens,

  async lookupPlayerUsername(name, categoryKey = null) {
    const q = (name || '').trim();
    if (!q) return [];
    try {
      const params = new URLSearchParams();
      params.set('name', q);
      if (categoryKey) params.set('category', categoryKey);
      const res = await fetch(`/api/players/lookup/?${params.toString()}`, {
        headers: defaultHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          return data.results;
        }
      }
    } catch {}

    let stateSource = DEFAULT_TITANS_STATE;
    try {
      const cached = localStorage.getItem("ruiru_titans_react_state");
      if (cached) stateSource = JSON.parse(cached);
    } catch {}

    const qLower = q.toLowerCase();
    const cleanDigits = q.replace(/^#/, '').trim();
    const isNum = cleanDigits !== '' && !isNaN(Number(cleanDigits));
    const targetNum = isNum ? parseInt(cleanDigits, 10) : null;

    const matches = [];
    const seen = new Set();
    Object.entries(stateSource.categories || {}).forEach(([cKey, cat]) => {
      if (categoryKey && cKey !== categoryKey) return;
      (cat.teams || []).forEach((team) => {
        (team.players || []).forEach((p) => {
          if (p.unknown) return;
          const pName = (p.name || '').toLowerCase();
          const pUname = (p.username || pName.replace(/[^a-z0-9]+/g, '_')).toLowerCase();
          const pJersey = p.jerseyNumber != null ? p.jerseyNumber : p.jersey_number;
          const matchesNum = targetNum !== null && pJersey === targetNum;
          if (pName.includes(qLower) || pUname.includes(qLower) || matchesNum) {
            const key = `${pUname}::${team.id}::${p.id || ''}`;
            if (seen.has(key)) return;
            seen.add(key);
            matches.push({
              id: p.id,
              name: p.name,
              username: p.username || pUname,
              jersey_number: pJersey,
              position: p.position || '',
              is_active: p.isActive !== false && p.is_active !== false,
              team_id: team.id,
              team_name: team.name,
              team_color: team.color || '#3F7A4E',
              category_key: cKey,
              category_name: cat.label || cKey,
            });
          }
        });
      });
    });
    return matches;
  },

  async getHighlights(params = {}) {
    try {
      const q = new URLSearchParams(params).toString();
      const res = await fetch(`/api/highlights/${q ? `?${q}` : ''}`, { headers: defaultHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      console.warn("Failed fetching highlights from API, using local fallback", err);
    }
    try {
      const cached = localStorage.getItem("ruiru_titans_highlights");
      if (cached) return JSON.parse(cached);
    } catch {}
    return [
      {
        id: 1,
        title: "Mancheli 2 - 1 Super Strikers | August 2026 Season Title Decider",
        description: "The climactic matchday showdown where Mancheli clinched the Ruiru Titans Open League title with goals from Kibe and Jimmy.",
        categoryKey: "open",
        matchName: "Mancheli vs Super Strikers",
        matchDate: "23 Aug 2026",
        videoType: "youtube",
        videoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
        thumbnailUrl: "",
        duration: "08:42",
        createdAt: "2026-08-23T18:00:00Z",
      },
      {
        id: 2,
        title: "Masters 2 - 0 Rangers | Kaama & Caleb Wonder Strikes",
        description: "Highlights from Masters dominant display at Thoome Pri., featuring Kaama's outside-the-box curler and Caleb's clinical finish.",
        categoryKey: "open",
        matchName: "Masters vs Rangers",
        matchDate: "16 Aug 2026",
        videoType: "youtube",
        videoUrl: "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
        thumbnailUrl: "",
        duration: "05:15",
        createdAt: "2026-08-16T17:30:00Z",
      },
      {
        id: 3,
        title: "Rangers 0 - 1 Super Strikers | Defensive Masterclass & Sam's Winner",
        description: "A tactical masterclass where Super Strikers ground out an essential 1-0 victory against a resilient Rangers defense.",
        categoryKey: "open",
        matchName: "Rangers vs Super Strikers",
        matchDate: "09 Aug 2026",
        videoType: "youtube",
        videoUrl: "https://www.youtube.com/watch?v=3JZ_D3ELwOQ",
        thumbnailUrl: "",
        duration: "06:30",
        createdAt: "2026-08-09T18:00:00Z",
      },
    ];
  },

  async createHighlight(formDataOrObj) {
    let isFormData = typeof FormData !== "undefined" && formDataOrObj instanceof FormData;
    try {
      const headers = { ...defaultHeaders() };
      if (isFormData) {
        delete headers["Content-Type"];
      }
      const res = await fetch("/api/highlights/", {
        method: "POST",
        headers,
        body: isFormData ? formDataOrObj : JSON.stringify(formDataOrObj),
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed creating highlight: ${res.status}`);
    } catch (err) {
      console.warn("Backend highlight creation error, fallback local storage", err);
      let newH = isFormData ? Object.fromEntries(formDataOrObj.entries()) : { ...formDataOrObj };
      newH.id = Date.now();
      newH.createdAt = new Date().toISOString();
      try {
        const current = (await this.getHighlights()) || [];
        const nextList = [newH, ...current];
        localStorage.setItem("ruiru_titans_highlights", JSON.stringify(nextList));
        return { success: true, highlight: newH };
      } catch {
        return { success: true, highlight: newH };
      }
    }
  },

  async deleteHighlight(id) {
    try {
      const res = await fetch(`/api/highlights/${id}/`, {
        method: "DELETE",
        headers: defaultHeaders(),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn("Backend highlight deletion error, fallback local storage", err);
    }
    try {
      const current = (await this.getHighlights()) || [];
      const nextList = current.filter((h) => h.id !== id);
      localStorage.setItem("ruiru_titans_highlights", JSON.stringify(nextList));
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  async toggleCategoryArchive(categoryKey, payload = {}) {
    try {
      const res = await fetch(`/api/categories/${categoryKey}/toggle-archive/`, {
        method: "POST",
        headers: defaultHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn("Toggle category archive API error:", err);
    }
    return null;
  },

  async getMatchReport(categoryKey, fixtureId) {
    const res = await fetch(`/api/categories/${categoryKey}/fixtures/${fixtureId}/report/`, {
      headers: defaultHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load match report: ${res.status}`);
    return await res.json();
  },

  async saveMatchReport(categoryKey, fixtureId, reportData) {
    const res = await fetch(`/api/categories/${categoryKey}/fixtures/${fixtureId}/report/`, {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(reportData),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to save match report: ${res.status}`);
    }
    return await res.json();
  },

  async deleteMatchReport(categoryKey, fixtureId) {
    const res = await fetch(`/api/categories/${categoryKey}/fixtures/${fixtureId}/report/`, {
      method: "DELETE",
      headers: defaultHeaders(),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to delete match report: ${res.status}`);
    }
    return await res.json();
  },

  async getDutyRoster(categoryKey) {
    const url = categoryKey
      ? `/api/categories/${encodeURIComponent(categoryKey)}/duty-roster/`
      : `/api/duty-roster/`;
    const res = await fetch(url, { headers: defaultHeaders() });
    if (!res.ok) throw new Error(`Failed to load duty roster: ${res.status}`);
    return await res.json();
  },

  async updateDutyRoster(categoryKey, payload) {
    const url = categoryKey
      ? `/api/categories/${encodeURIComponent(categoryKey)}/duty-roster/`
      : `/api/duty-roster/`;
    const res = await fetch(url, {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to update duty roster: ${res.status}`);
    }
    return await res.json();
  },

  async getComments(status = '') {
    const url = status ? `/api/comments/?status=${encodeURIComponent(status)}` : `/api/comments/`;
    const res = await fetch(url, { headers: defaultHeaders() });
    if (!res.ok) throw new Error(`Failed to load comments: ${res.status}`);
    return await res.json();
  },

  async submitComment(payload) {
    const res = await fetch(`/api/comments/`, {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to post comment: ${res.status}`);
    }
    return await res.json();
  },

  async moderateComment(commentId, action) {
    const res = await fetch(`/api/comments/`, {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify({ commentId, action }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to moderate comment: ${res.status}`);
    }
    return await res.json();
  },
};

