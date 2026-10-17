const BASE = "https://fantasy.premierleague.com/api";
const { readStale, writeGood } = require("./staleCache");

// Slow-changing endpoints we keep a last-good copy of.
const KEEP_STALE = /bootstrap-static|leagues-classic|fixtures\/\?event/;

// Short in-memory cache (per warm function instance) + retries, so a burst
// of requests (e.g. Captain Picks fires 20 at once, right at a deadline when
// FPL is busy) doesn't fail because of one transient FPL error.
const cache = new Map();
const TTL_MS = 30 * 1000;

async function fetchOnce(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (SFFC-FPL-Dashboard)" },
  });
  if (!res.ok) {
    const err = new Error(`FPL API ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function getJSON(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.p;
  const p = (async () => {
    let lastErr;
    for (let i = 0; i < 4; i++) {
      try {
        const data = await fetchOnce(url);
        if (KEEP_STALE.test(url)) await writeGood("fpl:" + url, data);
        return data;
      } catch (e) {
        lastErr = e;
        const retryable = !e.status || e.status === 429 || e.status >= 500;
        if (!retryable) break;
        await new Promise((r) => setTimeout(r, 400 * (i + 1) + Math.random() * 300));
      }
    }
    if (KEEP_STALE.test(url)) {
      const stale = await readStale("fpl:" + url);
      if (stale) {
        console.warn("FPL unavailable, serving last good copy of", url, "-", lastErr && lastErr.message);
        return stale;
      }
    }
    throw lastErr;
  })();
  cache.set(url, { t: Date.now(), p });
  p.catch(() => cache.delete(url)); // never cache failures
  return p;
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
