// Locks finished gameweeks.
//
// When a gameweek is over (finished, superseded by the next one, every fixture
// confirmed), its full Results page is saved once as "locked-gw-N", and its
// standings numbers as "gw-N". From then on the site serves ONLY those saved
// copies for that week — nothing is recalculated, so later changes (a pick
// edited, a manager moving league, a storage hiccup) can't alter the result.
//
// Only an admin "relock" can replace a locked week, and that calculates the
// new copy first and swaps it in — it never deletes before it has a good one.
const teamsConfig = require("./teamsConfig");
const { resultsStore } = require("./blobStore");
const { computeMatchResults } = require("./matchResults");
const { computeGameweek } = require("./gameweekView");

const lockKey = (event) => `locked-gw-${event}`;

async function readLocked(event) {
  try {
    return await resultsStore().get(lockKey(event), { type: "json" });
  } catch (_) {
    return null;
  }
}

// Is this freshly calculated page safe to freeze?
function lockProblem(body) {
  if (!body || !Array.isArray(body.matches) || !body.matches.length) return "no matches";
  if (!(body.event < body.currentEvent)) return "gameweek is not over yet";
  if (!body.matches.every((m) => m.status === "finished")) return "some fixtures not fully finished";
  return null;
}

function buildSnapshotResults(body) {
  const idOf = (club) => teamsConfig.find((t) => t.club === club).fplClubId;
  const clubScore = {};
  const opponentOf = {};
  for (const m of body.matches) {
    const h = idOf(m.home.club);
    const a = idOf(m.away.club);
    clubScore[h] = m.home.score;
    clubScore[a] = m.away.score;
    opponentOf[h] = a;
    opponentOf[a] = h;
  }
  return computeMatchResults(teamsConfig, clubScore, opponentOf);
}

// Saves the lock (and standings numbers) for a calculated page.
// overwrite=false: never touches an existing locked week.
async function saveLock(event, body, { overwrite = false } = {}) {
  const problem = lockProblem(body);
  if (problem) return { locked: false, reason: problem };
  const store = resultsStore();
  const existing = await store.get(lockKey(event), { type: "json" });
  if (existing && !overwrite) return { locked: false, reason: "already locked" };

  const frozen = { ...body, isLocked: true, lockedAt: new Date().toISOString() };
  const snapshot = { event, results: buildSnapshotResults(body) };
  await store.setJSON(lockKey(event), frozen);
  // Standings numbers always come from the same copy as the Results page.
  await store.setJSON(`gw-${event}`, snapshot);
  return { locked: true };
}

async function computeAndLock(event, opts) {
  const res = await computeGameweek({ queryStringParameters: { event: String(event) } });
  if (res.statusCode !== 200) return { locked: false, reason: `calculation failed: ${res.body}` };
  return saveLock(event, JSON.parse(res.body), opts);
}

module.exports = { readLocked, saveLock, computeAndLock, lockKey, lockProblem };
