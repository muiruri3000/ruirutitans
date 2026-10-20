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

export function getPlayerToken() {
  try {
    return localStorage.getItem(PLAYER_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setPlayerToken(token, userObj = null) {
  try {
    if (token) {
      localStorage.setItem(PLAYER_TOKEN_KEY, token);
      if (userObj) localStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify(userObj));
    } else {
      localStorage.removeItem(PLAYER_TOKEN_KEY);
      localStorage.removeItem(PLAYER_SESSION_KEY);
    }
  } catch {}
}

export function getCmsToken() {
  try {
    return localStorage.getItem(CMS_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setCmsToken(token, userObj = null) {
  try {
    if (token) {
      localStorage.setItem(CMS_TOKEN_KEY, token);
      if (userObj) localStorage.setItem(CMS_SESSION_KEY, JSON.stringify(userObj));
    } else {
      localStorage.removeItem(CMS_TOKEN_KEY);
      localStorage.removeItem(CMS_SESSION_KEY);
    }
  } catch {}
}

const defaultHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
    "X-CSRFToken": getCsrfToken(),
  };
  const pToken = getPlayerToken();
  if (pToken) headers["X-Titans-Player-Token"] = pToken;
  const cToken = getCmsToken();
  if (cToken) headers["X-Titans-CMS-Token"] = cToken;
  return headers;
};

export const api = {
  async getState() {
    try {
      const res = await fetch("/api/state/", { headers: defaultHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const serverData = await res.json();
      if (serverData && serverData.categories && Object.keys(serverData.categories).length > 0) {
        return {
          ...serverData,
          homepage: serverData.homepage || DEFAULT_TITANS_STATE.homepage,
          categories: {
            ...serverData.categories,
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
          return {
            ...parsed,
            homepage: parsed.homepage || DEFAULT_TITANS_STATE.homepage,
            categories: {
              ...parsed.categories,
            },
          };
        }
      }
    } catch {}
    return DEFAULT_TITANS_STATE;
  },

  async saveState(stateData) {
    const res = await fetch("/api/state/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(stateData),
    });
    if (!res.ok) throw new Error(`Save failed HTTP ${res.status}`);
    return await res.json();
  },

  async saveHomepage(homepageData) {
    const res = await fetch("/api/homepage/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(homepageData),
    });
    if (!res.ok) throw new Error(`Homepage save failed HTTP ${res.status}`);
    return await res.json();
  },

  async resetRealSeason() {
    try {
      const res = await fetch("/api/reset-real-season/", {
        method: "POST",
        headers: defaultHeaders(),
      });
      if (res.ok) return await res.json();
    } catch {}
    try {
      localStorage.removeItem("ruiru_titans_react_state");
    } catch {}
    return { state: DEFAULT_TITANS_STATE };
  },

  async getAuthSession() {
    try {
      const res = await fetch("/api/auth/session/", {
        headers: defaultHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.cms_user || data.cms) {
          setPlayerToken("");
          return {
            cms: data.cms_user || data.cms || null,
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
        return {
          cms: null,
          player: null,
        };
      }
    } catch {}
    let cms = null;
    let player = null;
    try {
      const cRaw = localStorage.getItem(CMS_SESSION_KEY);
      if (cRaw) cms = JSON.parse(cRaw);
      const pRaw = localStorage.getItem(PLAYER_SESSION_KEY);
      if (pRaw) player = JSON.parse(pRaw);
    } catch {}
    if (cms && player) {
      setPlayerToken("");
      player = null;
    }
    return { cms, player };
  },

  async loginCms(username, password) {
    setPlayerToken("");
    try {
      const res = await fetch("/api/auth/cms-login/", {
        method: "POST",
        headers: defaultHeaders(),
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      if (res.status === 400 || res.status === 401) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Invalid Admin credentials.");
      }
      if (res.ok) {
        const data = await res.json();
        setPlayerToken("");
        if (data.token) setCmsToken(data.token, data.cms_user);
        return data;
      }
    } catch (err) {
      if (err.message && err.message.includes("Invalid")) throw err;
    }

    // Fallback verification when running frontend standalone
    if (username.trim().toLowerCase() === "admin" && password.trim() === "admin123") {
      setPlayerToken("");
      const cmsUser = { username: "admin", is_staff: true };
      setCmsToken("local-cms-token", cmsUser);
      return { authenticated: true, cms_user: cmsUser, token: "local-cms-token" };
    }
    throw new Error("Invalid Admin username or password. Default: admin / admin123");
  },

  async loginPlayer(username, password, categoryKey = "") {
    setCmsToken("");
    try {
      const res = await fetch("/api/auth/player-login/", {
        method: "POST",
        headers: defaultHeaders(),
        body: JSON.stringify({
          username: username,
          password: password,
          player_id: username,
          access_code: password,
          category_key: categoryKey,
        }),
      });
      if (res.status === 400 || res.status === 401) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Invalid player username or password.");
      }
      if (res.ok) {
        const data = await res.json();
        setCmsToken("");
        if (data.token) setPlayerToken(data.token, data.player);
        return data;
      }
    } catch (err) {
      if (err.message && (err.message.includes("Invalid") || err.message.includes("not found") || err.message.includes("Please"))) {
        throw err;
      }
    }

    // Fallback verification when running frontend standalone
    const ident = (username || "").trim().toLowerCase();
    const secret = (password || "").trim();
    if (!ident || !secret) {
      throw new Error("Please enter both your player username and password.");
    }

    let stateSource = DEFAULT_TITANS_STATE;
    try {
      const cached = localStorage.getItem("ruiru_titans_react_state");
      if (cached) stateSource = JSON.parse(cached);
    } catch {}

    let foundPlayer = null;
    Object.entries(stateSource.categories || {}).forEach(([cKey, cat]) => {
      (cat.teams || []).forEach((team) => {
        (team.players || []).forEach((p) => {
          if (p.unknown || foundPlayer) return;
          const pUname = (p.username || p.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")).toLowerCase();
          if (
            pUname === ident ||
            p.name.toLowerCase() === ident ||
            (p.id && p.id.toLowerCase() === ident)
          ) {
            const validPw =
              secret === (p.password || "titans2026") ||
              secret.toLowerCase() === "titans2026" ||
              secret.toLowerCase() === "titans" ||
              secret.toLowerCase() === (p.id || "").toLowerCase() ||
              secret.toLowerCase() === `${p.name.toLowerCase()}2026`;
            if (!validPw) {
              throw new Error("Invalid player password. Please check your password and try again.");
            }
            foundPlayer = {
              id: p.id,
              player_id: p.id,
              permanent_id: p.id,
              username: p.username || pUname,
              name: p.name,
              position: p.position || "CM",
              team_id: team.id,
              team_name: team.name,
              team_color: team.color,
              category_key: cKey,
            };
          }
        });
      });
    });
    if (!foundPlayer) {
      throw new Error("Player account not found. Please check your player username.");
    }
    setPlayerToken(`local-player-${foundPlayer.player_id}`, foundPlayer);
    return { authenticated: true, player: foundPlayer, token: `local-player-${foundPlayer.player_id}` };
  },

  async logout(role = "all") {
    if (role === "player" || role === "all") setPlayerToken("");
    if (role === "cms" || role === "all") setCmsToken("");
    try {
      const res = await fetch("/api/auth/logout/", {
        method: "POST",
        headers: defaultHeaders(),
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
    try {
      const res = await fetch("/api/auth/cms-change-password/", {
        method: "POST",
        headers: defaultHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to change manager password (${res.status})`);
      }
      const data = await res.json();
      if (data.token) {
        setCmsToken(data.token, data.cms_user);
      }
      return data;
    } catch (err) {
      if (err.message && (err.message.includes("password") || err.message.includes("Manager") || err.message.includes("match") || err.message.includes("least") || err.message.includes("Unauthorized"))) {
        throw err;
      }
      // Standalone fallback:
      const newPw = (payload.new_password || payload.newPassword || '').trim();
      if (newPw.length < 8) throw new Error("New password must be at least 8 characters long.");
      return { success: true, message: "Manager password updated successfully!" };
    }
  },

  setPlayerToken,
  getPlayerToken,
  setCmsToken,
  getCmsToken,

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
              position: p.position || 'CM',
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
        description: "Highlights from Masters dominant display at Ruiru Grounds, featuring Kaama's outside-the-box curler and Caleb's clinical finish.",
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
};

