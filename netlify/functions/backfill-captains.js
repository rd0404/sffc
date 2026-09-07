// One-time (but safe to re-run) backfill: matches transcribed GW1-3
// captain names against each club's real 6 managers, writes the captain
// records, and clears any existing GW1-3 snapshots so they recompute
// WITH captain doubling instead of staying on old totals.
//
// Visit this URL once in a browser after deploying.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { setCaptainRecord } = require("../../lib/captainStore");
const { resultsStore } = require("../../lib/blobStore");
const records = require("../../lib/captainBackfillData");

function normalize(s) {
  return s.trim().toLowerCase();
}

exports.handler = async () => {
  const results = [];
  const standingsCache = {};

  async function getStandings(team) {
    if (!standingsCache[team.club]) {
      standingsCache[team.club] = await fplClient.getLeagueStandings(team.leagueId);
    }
    return standingsCache[team.club];
  }

  for (const rec of records) {
    const team = teamsConfig.find((t) => t.club === rec.club);
    if (!team) {
      results.push({ ...rec, status: "error", message: "Unknown club in backfill data" });
      continue;
    }

    if (rec.noCaptain) {
      results.push({
        ...rec,
        status: "skipped",
        message: "No captain recorded historically — left blank (falls back to the lowest-scorer default)",
      });
      continue;
    }

    if (rec.maxChip) {
      await setCaptainRecord(rec.club, rec.event, {
        maxChip: true,
        submittedAt: new Date().toISOString(),
        backfilled: true,
      });
      results.push({ ...rec, status: "ok", message: "Max Captain chip recorded" });
      continue;
    }

    try {
      const standings = await getStandings(team);
      const match = standings.standings.results.find(
        (m) => normalize(m.player_name) === normalize(rec.captainName)
      );
      if (!match) {
        results.push({
          ...rec,
          status: "error",
          message: "No manager name match found among this club's 6 — needs manual check",
        });
        continue;
      }
      await setCaptainRecord(rec.club, rec.event, {
        managerEntry: match.entry,
        submittedAt: new Date().toISOString(),
        backfilled: true,
      });
      results.push({
        ...rec,
        status: "ok",
        matchedEntry: match.entry,
        matchedTeamName: match.entry_name,
      });
    } catch (err) {
      results.push({ ...rec, status: "error", message: err.message });
    }
  }

  const store = resultsStore();
  const deletedSnapshots = [];
  for (const event of [1, 2, 3]) {
    try {
      const existing = await store.get(`gw-${event}`, { type: "json" });
      if (existing) {
        await store.delete(`gw-${event}`);
        deletedSnapshots.push(event);
      }
    } catch (_) {
      // No existing snapshot for this event — nothing to clear.
    }
  }

  const errorCount = results.filter((r) => r.status === "error").length;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: `${results.length - errorCount}/${results.length} matched, ${errorCount} need manual review`,
      deletedSnapshots,
      results,
    }),
  };
};
