// Netlify Scheduled Background Function.
// Runs automatically on the schedule set in netlify.toml (hourly) — no
// manual trigger needed. Every run:
//   1. Checks gameweeks 1..currentEvent in order.
//   2. Skips any gameweek already snapshotted (idempotent).
//   3. Skips any gameweek whose real fixtures aren't ALL finished yet.
//   4. For the first gameweek that's finished and not yet snapshotted,
//      computes each team's exact score via manager history and stores
//      the match results under key "gw-<event>".

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { computeMatchResults } = require("../../lib/matchResults");
const { resultsStore } = require("../../lib/blobStore");

exports.handler = async () => {
  const store = resultsStore();
  const bootstrap = await fplClient.getBootstrap();
  const currentEvent = fplClient.getCurrentEvent(bootstrap);

  const entryIdsByClub = {};
  await Promise.all(
    teamsConfig.map(async (team) => {
      const data = await fplClient.getLeagueStandings(team.leagueId);
      entryIdsByClub[team.fplClubId] = data.standings.results.map((m) => m.entry);
    })
  );

  for (let event = 1; event <= currentEvent; event++) {
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
      const entryIds = entryIdsByClub[team.fplClubId];
      let score = 0;
      for (const entryId of entryIds) {
        const history = await fplClient.getEntryHistory(entryId);
        const gwRow = history.current.find((h) => h.event === event);
        score += gwRow ? gwRow.points : 0;
      }
      clubScore[team.fplClubId] = score;
    }

    const results = computeMatchResults(teamsConfig, clubScore, opponentOf);

    await store.setJSON(`gw-${event}`, { event, results });
    break;
  }
};
