// Netlify Function — GET /.netlify/functions/gameweek?event=N
//
// Returns the given gameweek's (or current, if omitted) fixture-derived
// matchups and scores for all 20 SFFC teams. Live event_total is used for
// the current gameweek; a past gameweek's scores come from each manager's
// own history, which never changes once that gameweek is over.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { getClubScoreForEvent } = require("../../lib/managerData");

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

    const scoreByClub = {};
    await Promise.all(
      teamsConfig.map(async (team) => {
        scoreByClub[team.fplClubId] = await getClubScoreForEvent(
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

      matches.push({
        home: { club: homeTeam.club, score: scoreByClub[homeId] },
        away: { club: awayTeam.club, score: scoreByClub[awayId] },
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
