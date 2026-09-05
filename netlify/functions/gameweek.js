// Netlify Function — GET /.netlify/functions/gameweek
// (same logic as api/gameweek.js, adapted to Netlify's handler signature)

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");

exports.handler = async (event, context) => {
  try {
    const bootstrap = await fplClient.getBootstrap();
    const gw = fplClient.getCurrentEvent(bootstrap);
    const fixtures = await fplClient.getFixtures(gw);
    const { opponentOf, fixtureStatusOf } = buildFixtureLookups(fixtures);

    const standingsByClub = {};
    await Promise.all(
      teamsConfig.map(async (team) => {
        const data = await fplClient.getLeagueStandings(team.leagueId);
        const managers = data.standings.results;
        const score = managers.reduce((sum, m) => sum + m.event_total, 0);
        standingsByClub[team.fplClubId] = {
          club: team.club,
          fplClubId: team.fplClubId,
          score,
          managers: managers.map((m) => ({
            entry: m.entry,
            teamName: m.entry_name,
            managerName: m.player_name,
            eventTotal: m.event_total,
            total: m.total,
          })),
        };
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

      const home = standingsByClub[homeId];
      const away = standingsByClub[awayId];

      matches.push({
        home: { club: home.club, score: home.score },
        away: { club: away.club, score: away.score },
        status: fixtureStatusOf[homeId] || "not_started",
      });
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: gw, matches }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
