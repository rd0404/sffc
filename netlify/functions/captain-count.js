// Netlify Function — GET /.netlify/functions/captain-count?phase=1|2
//
// For each club, how many times each of the 6 members has been manually
// captained within the given phase — the rulebook requires at least 2
// per member per phase. Weeks where the Max Captain chip was used don't
// count toward any specific member, matching the rulebook.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { getCaptainRecord } = require("../../lib/captainStore");
const { getPhaseRange } = require("../../lib/phase");

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const phase = params.phase ? parseInt(params.phase, 10) : 1;
    const [start, end] = getPhaseRange(phase);

    const teamsOut = await Promise.all(
      teamsConfig.map(async (team) => {
        const standings = await fplClient.getLeagueStandings(team.leagueId);
        const managers = standings.standings.results.map((m) => ({
          entry: m.entry,
          teamName: m.entry_name,
          managerName: m.player_name,
          count: 0,
        }));

        for (let gw = start; gw <= end; gw++) {
          const record = await getCaptainRecord(team.club, gw);
          if (record && record.managerEntry) {
            const m = managers.find((mm) => mm.entry === record.managerEntry);
            if (m) m.count += 1;
          }
        }

        return { club: team.club, managers };
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, teams: teamsOut }),
    };
  } catch (err) {
    const storageResp = require("../../lib/blobStore").storageErrorResponse(err);
    if (storageResp) return storageResp;
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// Lets this function use Netlify's automatic storage credentials.
exports.handler = require("../../lib/blobStore").wrapHandler(exports.handler);
