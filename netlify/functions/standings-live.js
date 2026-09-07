const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { computeMatchResults } = require("../../lib/matchResults");
const { getClubScoreWithCaptain } = require("../../lib/managerData");
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

      const standingsCache = {};
      async function getStandings(team) {
        if (!standingsCache[team.club]) {
          standingsCache[team.club] = await fplClient.getLeagueStandings(team.leagueId);
        }
        return standingsCache[team.club];
      }

      const clubScore = {};
      await Promise.all(
        teamsConfig.map(async (team) => {
          const result = await getClubScoreWithCaptain(team, currentEvent, currentEvent, getStandings);
          clubScore[team.fplClubId] = result.total;
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
