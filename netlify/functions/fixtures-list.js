// GET /.netlify/functions/fixtures-list?event=N
// The raw real-world EPL fixture list for a gameweek.

const fplClient = require("../../lib/fplClient");

exports.handler = async (evt) => {
  try {
    const params = evt.queryStringParameters || {};
    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);
    const requestedEvent = params.event ? parseInt(params.event, 10) : currentEvent;

    const teamNameById = {};
    bootstrap.teams.forEach((t) => {
      teamNameById[t.id] = t.name;
    });

    const fixtures = await fplClient.getFixtures(requestedEvent);
    const list = fixtures.map((f) => ({
      home: teamNameById[f.team_h],
      away: teamNameById[f.team_a],
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
