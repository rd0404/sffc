// Netlify Function — GET /.netlify/functions/compare?club=Arsenal&event=3
//
// Powers the Compare Teams tab. Given a club and (optionally) a gameweek,
// returns:
//   - the opponent for that gameweek, auto-derived from the real fixture list
//   - each club's score for that specific gameweek (live if it's the
//     current gameweek, historical via manager entry history otherwise)
//   - each club's CURRENT overall table position/points/GD/record (always
//     the up-to-date live table, regardless of which past gameweek is
//     being inspected — matches how the reference dashboard behaves)
//   - a per-manager breakdown for both clubs: each manager's points for
//     the selected gameweek and their own FPL season-total points
//
// NOT included yet (needs the captain-tracking sheet, not connected):
// captain star per manager, fine deductions, Captain Count, Used CAP MAX.
// The frontend simply omits these until that's wired up.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { buildFixtureLookups } = require("../../lib/fixtures");
const { resultsStore } = require("../../lib/blobStore");
const { buildTable } = require("../../lib/standingsCalc");

async function getClubScoreForEvent(team, event, currentEvent, standingsCache) {
  if (event === currentEvent) {
    const data = await standingsCache(team);
    return data.standings.results.reduce((sum, m) => sum + m.event_total, 0);
  }
  const data = await standingsCache(team);
  const entryIds = data.standings.results.map((m) => m.entry);
  let score = 0;
  for (const entryId of entryIds) {
    const history = await fplClient.getEntryHistory(entryId);
    const row = history.current.find((h) => h.event === event);
    score += row ? row.points : 0;
  }
  return score;
}

async function getManagerBreakdown(team, event, currentEvent, standingsData) {
  const managers = [];
  for (const m of standingsData.standings.results) {
    let gwPoints;
    let totalPoints;
    if (event === currentEvent) {
      gwPoints = m.event_total;
      totalPoints = m.total;
    } else {
      const history = await fplClient.getEntryHistory(m.entry);
      const row = history.current.find((h) => h.event === event);
      gwPoints = row ? row.points : 0;
      totalPoints = row ? row.total_points : m.total;
    }
    managers.push({
      entry: m.entry,
      teamName: m.entry_name,
      managerName: m.player_name,
      gwPoints,
      totalPoints,
    });
  }
  return managers;
}

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

    // Cache league standings per team within this request (needed multiple times).
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

    // Current overall table (position/points/GD/record) — always the live
    // finalized table (this season's completed gameweeks only), independent
    // of which past gameweek is being inspected via the GW filter.
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
