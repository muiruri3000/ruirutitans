export function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && meta.content) return meta.content;
  const cookieMatch = document.cookie.match(/csrftoken=([^;]+)/);
  if (cookieMatch) return cookieMatch[1];
  return "";
}

const defaultHeaders = () => ({
  "Content-Type": "application/json",
  "X-CSRFToken": getCsrfToken(),
});

export const api = {
  async getState() {
    const res = await fetch("/api/state/");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
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

  async resetRealSeason() {
    const res = await fetch("/api/reset-real-season/", {
      method: "POST",
      headers: defaultHeaders(),
    });
    if (!res.ok) throw new Error(`Reset failed HTTP ${res.status}`);
    return await res.json();
  },

  async getCategories() {
    const res = await fetch("/api/categories/");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async createCategory(payload) {
    const res = await fetch("/api/categories/", {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to create category: ${res.status}`);
    return await res.json();
  },

  async deleteCategory(catKey) {
    const res = await fetch(`/api/categories/${catKey}/`, {
      method: "DELETE",
      headers: defaultHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to delete category: ${res.status}`);
    return true;
  },

  async getStandings(catKey, group = "") {
    const url = group
      ? `/api/categories/${catKey}/standings/?group=${encodeURIComponent(group)}`
      : `/api/categories/${catKey}/standings/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch standings: ${res.status}`);
    return await res.json();
  },

  async getH2H(catKey, team1Id, team2Id) {
    const res = await fetch(
      `/api/categories/${catKey}/h2h/?team1=${encodeURIComponent(team1Id)}&team2=${encodeURIComponent(team2Id)}`
    );
    if (!res.ok) throw new Error(`Failed to fetch H2H: ${res.status}`);
    return await res.json();
  },
};

