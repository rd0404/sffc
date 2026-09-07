// Netlify Function — GET /.netlify/functions/team-of-week?event=N
//
// For the given (or current) gameweek: the single top-scoring SFFC team,
// plus the top 5 and bottom 5 individual managers across all 120 managers
// league-wide, ranked by their own gameweek points.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { getClubScoreForEvent, getManagerBreakdown } = require("../../lib/managerData");

exports.handler = async (evt) => {
  try {
    const params = evt.queryStringParameters || {};
    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);
    const requestedEvent = params.event ? parseInt(params.event, 10) : currentEvent;

    const standingsCache = {};
    async function getStandings(team) {
      if (!standingsCache[team.club]) {
        standingsCache[team.club] = await fplClient.getLeagueStandings(team.leagueId);
      }
      return standingsCache[team.club];
    }

    const clubScores = [];
    let allManagers = [];

    await Promise.all(
      teamsConfig.map(async (team) => {
        const standingsData = await getStandings(team);
        const [score, managers] = await Promise.all([
          getClubScoreForEvent(team, requestedEvent, currentEvent, getStandings),
          getManagerBreakdown(team, requestedEvent, currentEvent, standingsData),
        ]);
        clubScores.push({ club: team.club, score });
        allManagers = allManagers.concat(managers);
      })
    );

    clubScores.sort((a, b) => b.score - a.score);
    const topTeam = clubScores[0];

    const sortedManagers = [...allManagers].sort((a, b) => b.gwPoints - a.gwPoints);
    const topManagers = sortedManagers.slice(0, 5);
    const bottomManagers = sortedManagers.slice(-5).reverse();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: requestedEvent,
        isCurrent: requestedEvent === currentEvent,
        topTeam,
        topManagers,
        bottomManagers,
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
