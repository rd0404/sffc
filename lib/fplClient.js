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

// bootstrap-static: teams, players (elements), and gameweek (events) metadata.
// Cheap-ish (~a few hundred KB) — fetch once per request and reuse.
async function getBootstrap() {
  return getJSON(`${BASE}/bootstrap-static/`);
}

function getCurrentEvent(bootstrap) {
  const current = bootstrap.events.find((e) => e.is_current);
  if (current) return current.id;
  // Between gameweeks (e.g. GW just finished, next not yet "current"):
  // fall back to the most recently finished event.
  const finished = bootstrap.events.filter((e) => e.finished);
  return finished.length ? finished[finished.length - 1].id : bootstrap.events[0].id;
}

async function getFixtures(event) {
  return getJSON(`${BASE}/fixtures/?event=${event}`);
}

// Live classic-league standings: entry IDs, manager/team names, and each
// manager's live event_total (this gameweek's points) + total (season).
// This one endpoint is what makes the whole system need zero manual upkeep.
async function getLeagueStandings(leagueId) {
  return getJSON(`${BASE}/leagues-classic/${leagueId}/standings/`);
}

// A single manager's picks for a given gameweek (15 players, starters =
// position 1-11, bench = 12-15). Needed for the "players played / left"
// feature — NOT needed for basic score totals (event_total covers that).
async function getEntryPicks(entryId, event) {
  return getJSON(`${BASE}/entry/${entryId}/event/${event}/picks/`);
}

module.exports = {
  getBootstrap,
  getCurrentEvent,
  getFixtures,
  getLeagueStandings,
  getEntryPicks,
};
