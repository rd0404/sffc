// Netlify Function — GET /.netlify/functions/standings-live?phase=1|2
//
// Same as /api/standings but scoped to one phase, PLUS the current
// gameweek's live scores folded in as provisional (if it falls in this
// phase). Each row includes "previousPosition" for a movement arrow —
// the club's rank with the most recent gameweek (finalized or live
// provisional) excluded.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { computeMatchResults } = require("../../lib/matchResults");
const { getClubScoreWithCaptain } = require("../../lib/managerData");
const { resultsStore } = require("../../lib/blobStore");
const { buildTable } = require("../../lib/standingsCalc");
const { getPhaseRange, getPhaseForEvent } = require("../../lib/phase");

exports.handler = async (evt) => {
  try {
    const params = evt.queryStringParameters || {};
    const phase = params.phase ? parseInt(params.phase, 10) : 1;
    const [start, end] = getPhaseRange(phase);

    const store = resultsStore();
    const { blobs } = await store.list({ prefix: "gw-" });

    const pairs = [];
    const snapshottedEvents = new Set();
    for (const blobMeta of blobs) {
      let data = null;
      try {
        data = await store.get(blobMeta.key, { type: "json" });
      } catch (_) {
        continue;
      }
      if (data && data.results && data.event >= start && data.event <= end) {
        pairs.push({ event: data.event, results: data.results });
      }
      if (data) snapshottedEvents.add(data.event);
    }

    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);

    let provisionalEvent = null;
    let settlingStatusByClub = {};

    if (getPhaseForEvent(currentEvent) === phase && !snapshottedEvents.has(currentEvent)) {
      const fixtures = await fplClient.getFixtures(currentEvent);
      const { opponentOf, fixtureStatusOf } = buildFixtureLookups(fixtures);

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

      teamsConfig.forEach((team) => {
        const status = fixtureStatusOf[team.fplClubId] || "not_started";
        if (status === "live" || status === "provisional") {
          settlingStatusByClub[team.club] = status;
        }
      });

      const liveResults = computeMatchResults(teamsConfig, clubScore, opponentOf);
      pairs.push({ event: currentEvent, results: liveResults });
      provisionalEvent = currentEvent;
    }

    const fullTable = buildTable(teamsConfig, pairs.map((p) => p.results));

    const latestEvent = pairs.length ? Math.max(...pairs.map((p) => p.event)) : null;
    const prevPairs = pairs.filter((p) => p.event < latestEvent);
    const prevTable = buildTable(teamsConfig, prevPairs.map((p) => p.results));
    const prevPositionByClub = {};
    prevTable.forEach((row, i) => {
      prevPositionByClub[row.club] = i + 1;
    });

    const standings = fullTable.map((row, i) => ({
      ...row,
      previousPosition: prevPairs.length ? prevPositionByClub[row.club] || null : null,
      settling: settlingStatusByClub[row.club] || null,
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standings, provisionalEvent, phase }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
