const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { resultsStore } = require("../../lib/blobStore");
const { buildTable } = require("../../lib/standingsCalc");
const { getClubScoreWithCaptain } = require("../../lib/managerData");

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

    const [clubResult, opponentResult] = await Promise.all([
      getClubScoreWithCaptain(clubTeam, requestedEvent, currentEvent, getStandings),
      getClubScoreWithCaptain(opponentTeam, requestedEvent, currentEvent, getStandings),
    ]);

    function withCaptainFlag(managers, captainEntry) {
      return managers.map((m) => ({ ...m, isCaptain: m.entry === captainEntry }));
    }

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
          gwScore: clubResult.total,
          usedMaxChip: clubResult.usedMaxChip,
          position: clubRow ? clubRow.position : null,
          tablePoints: clubRow ? clubRow.points : null,
          goalDifference: clubRow ? clubRow.scoreFor - clubRow.scoreAgainst : null,
          record: clubRow ? { won: clubRow.won, drawn: clubRow.drawn, lost: clubRow.lost } : null,
          seasonTotal: clubRow ? clubRow.scoreFor : null,
          managers: withCaptainFlag(clubResult.managers, clubResult.captainEntry),
        },
        opponent: {
          name: opponentTeam.club,
          gwScore: opponentResult.total,
          usedMaxChip: opponentResult.usedMaxChip,
          position: opponentRow ? opponentRow.position : null,
          tablePoints: opponentRow ? opponentRow.points : null,
          goalDifference: opponentRow ? opponentRow.scoreFor - opponentRow.scoreAgainst : null,
          record: opponentRow ? { won: opponentRow.won, drawn: opponentRow.drawn, lost: opponentRow.lost } : null,
          seasonTotal: opponentRow ? opponentRow.scoreFor : null,
          managers: withCaptainFlag(opponentResult.managers, opponentResult.captainEntry),
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
