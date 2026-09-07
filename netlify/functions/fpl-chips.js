// Netlify Function — GET /.netlify/functions/fpl-chips?club=Arsenal&event=3
//
// Rolling cumulative count: how many times a club's 6 managers have
// played each real FPL chip (Wildcard, Free Hit, Bench Boost, Triple
// Captain) from the START OF THE PHASE through the selected gameweek —
// carrying forward each week rather than resetting, so picking GW5 shows
// everything used across GW1-5, not just GW5 alone.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { getPhaseForEvent, getPhaseRange } = require("../../lib/phase");

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

    const phase = getPhaseForEvent(requestedEvent);
    const [phaseStart] = getPhaseRange(phase);

    const standings = await fplClient.getLeagueStandings(team.leagueId);
    const managers = standings.standings.results;

    // Fetch every (manager x gameweek) combination in parallel — from the
    // start of the phase through the selected gameweek — for maximum
    // speed within the function's time limit.
    const tasks = [];
    for (const m of managers) {
      for (let gw = phaseStart; gw <= requestedEvent; gw++) {
        tasks.push(
          fplClient.getEntryPicks(m.entry, gw).then((picks) => picks.active_chip)
        );
      }
    }
    const activeChips = await Promise.all(tasks);

    const counts = { wildcard: 0, freehit: 0, bboost: 0, "3xc": 0 };
    activeChips.forEach((chip) => {
      if (chip && counts.hasOwnProperty(chip)) counts[chip] += 1;
    });

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
        phase,
        phaseStart,
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
