// Netlify Scheduled Background Function.
// Runs automatically on the schedule set in netlify.toml (hourly). Every
// run checks gameweeks 1..(currentEvent - 1) — NEVER the gameweek FPL
// still considers "current", even if all its fixtures report
// finished:true, since bonus points can apparently still shift slightly
// after that flag flips. Only a gameweek that's been fully superseded by
// the next one is safe to lock in permanently. Skips any already
// snapshotted, and computes + stores every newly-eligible one it finds.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { computeMatchResults } = require("../../lib/matchResults");
const { getClubScoreWithCaptain } = require("../../lib/managerData");
const { resultsStore } = require("../../lib/blobStore");

exports.handler = async () => {
  const store = resultsStore();
  const bootstrap = await fplClient.getBootstrap();
  const currentEvent = fplClient.getCurrentEvent(bootstrap);

  const standingsCache = {};
  async function getStandings(team) {
    if (!standingsCache[team.club]) {
      standingsCache[team.club] = await fplClient.getLeagueStandings(team.leagueId);
    }
    return standingsCache[team.club];
  }

  let snapshotted = 0;

  for (let event = 1; event < currentEvent; event++) {
    let existing = null;
    try {
      existing = await store.get(`gw-${event}`, { type: "json" });
    } catch (_) {
      existing = null;
    }
    if (existing) continue;

    const fixtures = await fplClient.getFixtures(event);
    if (!fixtures.length) continue;
    const allFinished = fixtures.every((f) => f.finished);
    if (!allFinished) continue;

    const { opponentOf } = buildFixtureLookups(fixtures);

    const clubScore = {};
    for (const team of teamsConfig) {
      const result = await getClubScoreWithCaptain(team, event, currentEvent, getStandings);
      clubScore[team.fplClubId] = result.total;
    }

    const results = computeMatchResults(teamsConfig, clubScore, opponentOf);

    await store.setJSON(`gw-${event}`, { event, results });
    snapshotted += 1;
  }

  return { snapshotted };
};
