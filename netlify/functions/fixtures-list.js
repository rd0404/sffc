// Netlify Function — GET /.netlify/functions/fixtures-list?event=N
//
// The raw real-world EPL fixture list for a gameweek — kickoff times,
// scores, status, and each club's official badge image for each actual
// Premier League match. The badge URL is built from bootstrap-static's
// own "code" field per team, fetched live every time — so it never
// needs updating if a club is promoted/relegated next season.

const fplClient = require("../../lib/fplClient");

function badgeUrl(code) {
  return `https://resources.premierleague.com/premierleague/badges/50/t${code}.png`;
}

exports.handler = async (evt) => {
  try {
    const params = evt.queryStringParameters || {};
    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);
    const requestedEvent = params.event ? parseInt(params.event, 10) : currentEvent;

    const teamById = {};
    bootstrap.teams.forEach((t) => {
      teamById[t.id] = t;
    });

    const fixtures = await fplClient.getFixtures(requestedEvent);
    const list = fixtures.map((f) => ({
      home: teamById[f.team_h] ? teamById[f.team_h].name : null,
      homeBadge: teamById[f.team_h] ? badgeUrl(teamById[f.team_h].code) : null,
      away: teamById[f.team_a] ? teamById[f.team_a].name : null,
      awayBadge: teamById[f.team_a] ? badgeUrl(teamById[f.team_a].code) : null,
      homeScore: f.team_h_score,
      awayScore: f.team_a_score,
      kickoff: f.kickoff_time,
      status: f.finished ? "finished" : f.started ? "live" : "not_started",
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: requestedEvent,
        isCurrent: requestedEvent === currentEvent,
        fixtures: list,
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
