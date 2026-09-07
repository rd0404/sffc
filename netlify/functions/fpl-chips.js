// Netlify Function — GET /.netlify/functions/fpl-chips?club=Arsenal&event=3
//
// For a club's 6 managers, how many used each of the 4 real FPL chips
// (Wildcard, Free Hit, Bench Boost, Triple Captain) in the given
// gameweek — read directly from each manager's own picks.active_chip,
// the same field FPL itself uses to mark a chip as played that week.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");

const CHIP_LABELS = {
  wildcard: "Wildcard",
  freehit: "Free Hit",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
};

exports.handler = async (evt) => {
  try {
    const params = evt.queryStringParameters || {};
    const clubName = params.club;
    if (!clubName) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing required 'club' query parameter" }),
      };
    }

    const team = teamsConfig.find((t) => t.club === clubName);
    if (!team) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Unknown club '${clubName}'` }),
      };
    }

    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);
    const requestedEvent = params.event ? parseInt(params.event, 10) : currentEvent;

    const standings = await fplClient.getLeagueStandings(team.leagueId);
    const managers = standings.standings.results;

    const counts = { wildcard: 0, freehit: 0, bboost: 0, "3xc": 0 };

    await Promise.all(
      managers.map(async (m) => {
        const picks = await fplClient.getEntryPicks(m.entry, requestedEvent);
        const chip = picks.active_chip;
        if (chip && counts.hasOwnProperty(chip)) {
          counts[chip] += 1;
        }
      })
    );

    const chips = Object.keys(CHIP_LABELS).map((key) => ({
      key,
      label: CHIP_LABELS[key],
      count: counts[key],
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        club: clubName,
        event: requestedEvent,
        totalManagers: managers.length,
        chips,
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
