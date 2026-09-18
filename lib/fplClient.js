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

async function getEntryHistory(entryId) {
  return getJSON(`${BASE}/entry/${entryId}/history/`);
}

// The REAL live feed — every player's points update continuously here
// as matches happen, unlike entry_history.points (from the picks
// endpoint) which only seems to refresh periodically rather than
// minute-by-minute.
async function getEventLive(event) {
  return getJSON(`${BASE}/event/${event}/live/`);
}

module.exports = {
  getBootstrap,
  getCurrentEvent,
  getFixtures,
  getLeagueStandings,
  getEntryPicks,
  getEntryHistory,
  getEventLive,
};
