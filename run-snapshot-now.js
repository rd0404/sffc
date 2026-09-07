// Netlify Function — GET /.netlify/functions/run-snapshot-now
//
// Same logic as snapshot-gameweek-background.js, but as a normal function
// you can trigger directly by visiting the URL — background functions
// (the "-background" suffix) can ONLY be invoked by their schedule, not
// by a direct browser visit, which is why that approach 403'd.
//
// Safe to call anytime; it only does work for gameweeks that are both
// fully finished AND not yet snapshotted.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { computeMatchResults } = require("../../lib/matchResults");
const { getClubScoreWithCaptain } = require("../../lib/managerData");
const { resultsStore } = require("../../lib/blobStore");

exports.handler = async () => {
  try {
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

    const snapshottedNow = [];

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
        const result = await getClubScoreWithCaptain(team, event, currentEvent, getStandings);
        clubScore[team.fplClubId] = result.total;
      }

      const results = computeMatchResults(teamsConfig, clubScore, opponentOf);

      await store.setJSON(`gw-${event}`, { event, results });
      snapshottedNow.push(event);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshottedNow, currentEvent }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
