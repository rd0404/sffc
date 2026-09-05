// Netlify Function — GET /.netlify/functions/standings-live
//
// Same as /api/standings, PLUS the current in-progress gameweek's live
// scores folded in as a provisional result — clearly flagged via
// "provisionalEvent" in the response so the frontend can show a "live,
// not yet final" indicator.
//
// If the current gameweek has already been snapshotted as finalized,
// this behaves exactly like /api/standings — no double-counting.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { computeMatchResults } = require("../../lib/matchResults");
const { resultsStore } = require("../../lib/blobStore");
const { buildTable } = require("../../lib/standingsCalc");

exports.handler = async () => {
  try {
    const store = resultsStore();
    const { blobs } = await store.list({ prefix: "gw-" });

    const allResults = [];
    const snapshottedEvents = new Set();
    for (const blobMeta of blobs) {
      let data = null;
      try {
        data = await store.get(blobMeta.key, { type: "json" });
      } catch (_) {
        continue;
      }
      if (data && data.results) {
        allResults.push(data.results);
        snapshottedEvents.add(data.event);
      }
    }

    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);

    let provisionalEvent = null;

    if (!snapshottedEvents.has(currentEvent)) {
      const fixtures = await fplClient.getFixtures(currentEvent);
      const { opponentOf } = buildFixtureLookups(fixtures);

      const clubScore = {};
      await Promise.all(
        teamsConfig.map(async (team) => {
          const data = await fplClient.getLeagueStandings(team.leagueId);
          const score = data.standings.results.reduce(
            (sum, m) => sum + m.event_total,
            0
          );
          clubScore[team.fplClubId] = score;
        })
      );

      const liveResults = computeMatchResults(teamsConfig, clubScore, opponentOf);
      allResults.push(liveResults);
      provisionalEvent = currentEvent;
    }

    const standings = buildTable(teamsConfig, allResults);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standings, provisionalEvent }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
