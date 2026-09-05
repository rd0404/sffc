// Netlify Function — GET /.netlify/functions/progress
// (same logic as api/progress.js, adapted to Netlify's handler signature)

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");

exports.handler = async (event, context) => {
  try {
    const bootstrap = await fplClient.getBootstrap();
    const gw = fplClient.getCurrentEvent(bootstrap);
    const fixtures = await fplClient.getFixtures(gw);
    const { fixtureStatusOf } = buildFixtureLookups(fixtures);

    const clubOfElement = {};
    for (const el of bootstrap.elements) {
      clubOfElement[el.id] = el.team;
    }

    const teamsOut = await Promise.all(
      teamsConfig.map(async (team) => {
        const standings = await fplClient.getLeagueStandings(team.leagueId);
        const entryIds = standings.standings.results.map((m) => m.entry);

        let played = 0;
        let left = 0;

        const allPicks = await Promise.all(
          entryIds.map((id) => fplClient.getEntryPicks(id, gw))
        );

        for (const picksData of allPicks) {
          const starters = picksData.picks.filter((p) => p.position <= 11);
          for (const p of starters) {
            const clubId = clubOfElement[p.element];
            const status = fixtureStatusOf[clubId];
            if (status === "live" || status === "finished") {
              played += 1;
            } else {
              left += 1;
            }
          }
        }

        return {
          club: team.club,
          playersPlayed: played,
          playersLeft: left,
          totalStarters: played + left,
        };
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: gw, teams: teamsOut }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
