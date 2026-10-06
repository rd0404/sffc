// Netlify Function — GET /.netlify/functions/gameweek?event=N
//
// Returns the given gameweek's (or current, if omitted) fixture-derived
// matchups and scores for all 20 SFFC teams, with the captain doubling
// rule applied, and TRUE minute-by-minute live scoring for the current
// gameweek (see lib/managerData.js).

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { getClubScoreWithCaptain, buildLiveContext } = require("../../lib/managerData");

function badgeUrl(code) {
  return `https://resources.premierleague.com/premierleague/badges/50/t${code}.png`;
}

exports.handler = async (evt) => {
  try {
    const params = evt.queryStringParameters || {};
    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);
    const requestedEvent = params.event ? parseInt(params.event, 10) : currentEvent;

    // Captain details stay hidden until that gameweek's deadline passes
    // (same rule as Captain Picks / Compare) — the scores themselves are
    // always captain-doubled correctly; only the reveal is gated.
    const requestedEv = bootstrap.events.find((e) => e.id === requestedEvent);
    const locked = requestedEv ? Date.now() >= new Date(requestedEv.deadline_time).getTime() : false;

    const fixtures = await fplClient.getFixtures(requestedEvent);
    const { opponentOf, fixtureStatusOf } = buildFixtureLookups(fixtures);

    const teamCodeByFplId = {};
    bootstrap.teams.forEach((t) => {
      teamCodeByFplId[t.id] = t.code;
    });

    const standingsCache = {};
    async function getStandings(team) {
      if (!standingsCache[team.club]) {
        standingsCache[team.club] = await fplClient.getLeagueStandings(team.leagueId);
      }
      return standingsCache[team.club];
    }

    let liveContext = null;
    if (requestedEvent === currentEvent) {
      liveContext = await buildLiveContext(bootstrap, requestedEvent);
    }

    const resultByClub = {};
    await Promise.all(
      teamsConfig.map(async (team) => {
        resultByClub[team.fplClubId] = await getClubScoreWithCaptain(
          team,
          requestedEvent,
          currentEvent,
          getStandings,
          liveContext
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
          badge: teamCodeByFplId[homeId] ? badgeUrl(teamCodeByFplId[homeId]) : null,
          score: homeResult.total,
          captainEntry: locked ? homeResult.captainEntry : null,
          captainPoints: locked ? homeResult.captainPoints : null,
          captainSubmitted: locked ? homeResult.submitted : null,
          usedMaxChip: locked ? homeResult.usedMaxChip : false,
        },
        away: {
          club: awayTeam.club,
          badge: teamCodeByFplId[awayId] ? badgeUrl(teamCodeByFplId[awayId]) : null,
          score: awayResult.total,
          captainEntry: locked ? awayResult.captainEntry : null,
          captainPoints: locked ? awayResult.captainPoints : null,
          captainSubmitted: locked ? awayResult.submitted : null,
          usedMaxChip: locked ? awayResult.usedMaxChip : false,
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
        locked,
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
