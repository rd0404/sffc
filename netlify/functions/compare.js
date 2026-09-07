// Netlify Function — GET /.netlify/functions/compare?club=Arsenal&event=3
//
// Powers the Compare Teams tab. Given a club and (optionally) a gameweek,
// returns:
//   - the opponent for that gameweek, auto-derived from the real fixture list
//   - each club's score for that specific gameweek (live if it's the
//     current gameweek, historical via manager entry history otherwise)
//   - each club's CURRENT overall table position/points/GD/record
//   - a per-manager breakdown for both clubs
//
// NOT included yet (needs the captain-tracking sheet, not connected):
// captain star per manager, fine deductions, Captain Count, Used CAP MAX.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { resultsStore } = require("../../lib/blobStore");
const { buildTable } = require("../../lib/standingsCalc");
const { getClubScoreForEvent, getManagerBreakdown } = require("../../lib/managerData");

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const clubName = params.club;
    if (!clubName) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing required 'club' query parameter" }),
      };
    }

    const clubTeam = teamsConfig.find((t) => t.club === clubName);
    if (!clubTeam) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Unknown club '${clubName}'` }),
      };
    }

    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);
    const requestedEvent = params.event ? parseInt(params.event, 10) : currentEvent;

    const fixtures = await fplClient.getFixtures(requestedEvent);
    const { opponentOf } = buildFixtureLookups(fixtures);
    const opponentClubId = opponentOf[clubTeam.fplClubId];

    if (opponentClubId == null) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: requestedEvent, club: clubName, opponent: null, blank: true }),
      };
    }

    const opponentTeam = teamsConfig.find((t) => t.fplClubId === opponentClubId);

    const standingsCache = {};
    async function getStandings(team) {
      if (!standingsCache[team.club]) {
        standingsCache[team.club] = await fplClient.getLeagueStandings(team.leagueId);
      }
      return standingsCache[team.club];
    }

    const [clubScore, opponentScore] = await Promise.all([
      getClubScoreForEvent(clubTeam, requestedEvent, currentEvent, getStandings),
      getClubScoreForEvent(opponentTeam, requestedEvent, currentEvent, getStandings),
    ]);

    const [clubStandingsData, opponentStandingsData] = await Promise.all([
      getStandings(clubTeam),
      getStandings(opponentTeam),
    ]);

    const [clubManagers, opponentManagers] = await Promise.all([
      getManagerBreakdown(clubTeam, requestedEvent, currentEvent, clubStandingsData),
      getManagerBreakdown(opponentTeam, requestedEvent, currentEvent, opponentStandingsData),
    ]);

    const store = resultsStore();
    const { blobs } = await store.list({ prefix: "gw-" });
    const finalizedResults = [];
    for (const blobMeta of blobs) {
      let data = null;
      try {
        data = await store.get(blobMeta.key, { type: "json" });
      } catch (_) {
        continue;
      }
      if (data && data.results) finalizedResults.push(data.results);
    }
    const table = buildTable(teamsConfig, finalizedResults);
    const tableWithRank = table.map((row, i) => ({ ...row, position: i + 1 }));

    const clubRow = tableWithRank.find((r) => r.club === clubName);
    const opponentRow = tableWithRank.find((r) => r.club === opponentTeam.club);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: requestedEvent,
        currentEvent,
        club: {
          name: clubName,
          gwScore: clubScore,
          position: clubRow ? clubRow.position : null,
          tablePoints: clubRow ? clubRow.points : null,
          goalDifference: clubRow ? clubRow.scoreFor - clubRow.scoreAgainst : null,
          record: clubRow ? { won: clubRow.won, drawn: clubRow.drawn, lost: clubRow.lost } : null,
          seasonTotal: clubRow ? clubRow.scoreFor : null,
          managers: clubManagers,
        },
        opponent: {
          name: opponentTeam.club,
          gwScore: opponentScore,
          position: opponentRow ? opponentRow.position : null,
          tablePoints: opponentRow ? opponentRow.points : null,
          goalDifference: opponentRow ? opponentRow.scoreFor - opponentRow.scoreAgainst : null,
          record: opponentRow ? { won: opponentRow.won, drawn: opponentRow.drawn, lost: opponentRow.lost } : null,
          seasonTotal: opponentRow ? opponentRow.scoreFor : null,
          managers: opponentManagers,
        },
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
