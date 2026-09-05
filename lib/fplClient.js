// Minimal client for the public (unauthenticated) FPL API.
// Runs server-side only (Vercel/Netlify function) — the FPL API has no CORS
// headers, so none of this can run directly in a browser.

const BASE = "https://fantasy.premierleague.com/api";

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (SFFC-FPL-Dashboard)" },
  });
  if (!res.ok) {
    throw new Error(`FPL API ${res.status} for ${url}`);
  }
  return res.json();
}

async function getBootstrap() {
  return getJSON(`${BASE}/bootstrap-static/`);
}

function getCurrentEvent(bootstrap) {
  const current = bootstrap.events.find((e) => e.is_current);
  if (current) return current.id;
  const finished = bootstrap.events.filter((e) => e.finished);
  return finished.length ? finished[finished.length - 1].id : bootstrap.events[0].id;
}

async function getFixtures(event) {
  return getJSON(`${BASE}/fixtures/?event=${event}`);
}

async function getLeagueStandings(leagueId) {
  return getJSON(`${BASE}/leagues-classic/${leagueId}/standings/`);
}

async function getEntryPicks(entryId, event) {
  return getJSON(`${BASE}/entry/${entryId}/event/${event}/picks/`);
}

// A manager's full season history: { current: [{ event, points, ... }] }.
// Unlike leagues-classic standings (which only ever shows the CURRENT
// live gameweek's event_total), this gives exact points for any past
// gameweek — what the season-standings snapshot job needs.
async function getEntryHistory(entryId) {
  return getJSON(`${BASE}/entry/${entryId}/history/`);
}

module.exports = {
  getBootstrap,
  getCurrentEvent,
  getFixtures,
  getLeagueStandings,
  getEntryPicks,
  getEntryHistory,
};
