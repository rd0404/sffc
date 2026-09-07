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
    break;
  }
};
