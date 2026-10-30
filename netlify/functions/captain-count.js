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
    const [start, phaseEnd] = getPhaseRange(phase);

    // Only count gameweeks whose deadline has passed: picks for an upcoming GW
    // can still be changed, so they must not show up in the count yet.
    const bootstrap = await fplClient.getBootstrap();
    const now = Date.now();
    let lastLocked = 0;
    for (const ev of bootstrap.events) {
      if (new Date(ev.deadline_time).getTime() <= now && ev.id > lastLocked) lastLocked = ev.id;
    }
    const end = Math.min(phaseEnd, lastLocked);

    const teamsOut = await Promise.all(
      teamsConfig.map(async (team) => {
        const standings = await fplClient.getLeagueStandings(team.leagueId);
        const managers = standings.standings.results.map((m) => ({
          entry: m.entry,
          teamName: m.entry_name,
          managerName: m.player_name,
          count: 0,
        }));

        const gws = [];
        for (let gw = start; gw <= end; gw++) gws.push(gw);
        const records = await Promise.all(gws.map((gw) => getCaptainRecord(team.club, gw)));
        for (const record of records) {
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
      body: JSON.stringify({ phase, countedThrough: end >= start ? end : null, teams: teamsOut }),
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
