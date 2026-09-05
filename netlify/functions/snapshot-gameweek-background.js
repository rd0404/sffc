// Netlify Scheduled Background Function.
// Runs automatically on the schedule set in netlify.toml (hourly) — no
// manual trigger needed. Every run:
//   1. Checks gameweeks 1..currentEvent in order.
//   2. Skips any gameweek already snapshotted (idempotent — safe to run
//      as often as you like).
//   3. Skips any gameweek whose real fixtures aren't ALL finished yet.
//   4. For the first gameweek that's finished and not yet snapshotted,
//      computes each team's exact score for that gameweek (via each
//      manager's entry history, which is stable regardless of what
//      gameweek is "current" right now) and stores the match results
//      and 3/1/0 points under key "gw-<event>".

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
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

    const seen = new Set();
    const results = [];

    for (const team of teamsConfig) {
      const homeId = team.fplClubId;
      if (seen.has(homeId)) continue;

      const awayId = opponentOf[homeId];
      if (awayId == null) continue;

      seen.add(homeId);
      seen.add(awayId);

      const homeTeam = teamsConfig.find((t) => t.fplClubId === homeId);
      const awayTeam = teamsConfig.find((t) => t.fplClubId === awayId);
      const homeScore = clubScore[homeId];
      const awayScore = clubScore[awayId];

      let homePts;
      let awayPts;
      if (homeScore > awayScore) {
        homePts = 3;
        awayPts = 0;
      } else if (homeScore < awayScore) {
        homePts = 0;
        awayPts = 3;
      } else {
        homePts = 1;
        awayPts = 1;
      }

      results.push({
        home: homeTeam.club,
        homeScore,
        homePts,
        away: awayTeam.club,
        awayScore,
        awayPts,
      });
    }

    await store.setJSON(`gw-${event}`, { event, results });
    break;
  }
};
