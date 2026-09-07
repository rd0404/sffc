const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { getClubScoreWithCaptain } = require("../../lib/managerData");

exports.handler = async (evt) => {
  try {
    const params = evt.queryStringParameters || {};
    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);
    const requestedEvent = params.event ? parseInt(params.event, 10) : currentEvent;

    const fixtures = await fplClient.getFixtures(requestedEvent);
    const { opponentOf, fixtureStatusOf } = buildFixtureLookups(fixtures);

    const standingsCache = {};
    async function getStandings(team) {
      if (!standingsCache[team.club]) {
        standingsCache[team.club] = await fplClient.getLeagueStandings(team.leagueId);
      }
      return standingsCache[team.club];
    }

    const resultByClub = {};
    await Promise.all(
      teamsConfig.map(async (team) => {
        resultByClub[team.fplClubId] = await getClubScoreWithCaptain(
          team,
          requestedEvent,
          currentEvent,
          getStandings
        );
      })
    );

    const seen = new Set();
    const matches = [];

    for (const team of teamsConfig) {
      const homeId = team.fplClubId;
      if (seen.has(homeId)) continue;

      const awayId = opponentOf[homeId];
      if (awayId == null) continue;

      seen.add(homeId);
      seen.add(awayId);

      const homeTeam = teamsConfig.find((t) => t.fplClubId === homeId);
      const awayTeam = teamsConfig.find((t) => t.fplClubId === awayId);
      const homeResult = resultByClub[homeId];
      const awayResult = resultByClub[awayId];

      matches.push({
        home: {
          club: homeTeam.club,
          score: homeResult.total,
          captainEntry: homeResult.captainEntry,
          usedMaxChip: homeResult.usedMaxChip,
        },
        away: {
          club: awayTeam.club,
          score: awayResult.total,
          captainEntry: awayResult.captainEntry,
          usedMaxChip: awayResult.usedMaxChip,
        },
        status: fixtureStatusOf[homeId] || "not_started",
      });
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: requestedEvent,
        isCurrent: requestedEvent === currentEvent,
        matches,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
