// Netlify Function — GET /.netlify/functions/squad-detail?club=Arsenal&event=3
//
// For a club's 6 managers, their full 15-player squad: each player's
// name, real EPL club, position, whether they're the manager's own FPL
// captain/vice, and whether their real fixture has kicked off/finished/
// not started yet. Powers both the Played vs Remaining detail view and
// the Player Ownership tab.
//
// If the requested gameweek's deadline hasn't passed yet, there's no
// real locked-in squad for it — we fall back to the most recent
// gameweek whose deadline HAS passed (e.g. GW5 requested but not yet
// locked -> shows GW4's actual squads instead), and flag this via
// "isFallback"/"dataEvent" so the frontend can label it clearly. Once
// GW5's own deadline passes, this automatically switches to real GW5 data.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { getEffectivePickEvent } = require("../../lib/pickEvent");

const ELEMENT_TYPE_LABEL = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

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

    const { pickEvent, isFallback } = getEffectivePickEvent(bootstrap, requestedEvent);

    // Fixture status is still based on the REQUESTED gameweek — that's
    // the real upcoming match context (opponent, kickoff), even while
    // the squads themselves are a preview from an earlier gameweek.
    const fixtures = await fplClient.getFixtures(requestedEvent);
    const { fixtureStatusOf } = buildFixtureLookups(fixtures);

    const teamNameById = {};
    bootstrap.teams.forEach((t) => {
      teamNameById[t.id] = t.name;
    });

    const elementById = {};
    bootstrap.elements.forEach((el) => {
      elementById[el.id] = el;
    });

    const standings = await fplClient.getLeagueStandings(team.leagueId);

    const managers = await Promise.all(
      standings.standings.results.map(async (m) => {
        const picksData = await fplClient.getEntryPicks(m.entry, pickEvent);

        function toPlayer(p) {
          const el = elementById[p.element];
          return {
            name: el ? el.web_name : `#${p.element}`,
            realClub: el ? teamNameById[el.team] : null,
            position: ELEMENT_TYPE_LABEL[el ? el.element_type : null] || "?",
            status: el ? fixtureStatusOf[el.team] || "not_started" : "not_started",
            isCaptain: p.is_captain,
            isViceCaptain: p.is_vice_captain,
            multiplier: p.multiplier,
          };
        }

        const starters = picksData.picks.filter((p) => p.position <= 11).map(toPlayer);
        const bench = picksData.picks.filter((p) => p.position > 11).map(toPlayer);

        return {
          entry: m.entry,
          teamName: m.entry_name,
          managerName: m.player_name,
          starters,
          bench,
        };
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        club: clubName,
        event: requestedEvent,
        dataEvent: pickEvent,
        isFallback,
        isCurrent: requestedEvent === currentEvent,
        managers,
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
