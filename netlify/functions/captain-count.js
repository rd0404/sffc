// GET /.netlify/functions/captain-count?phase=1|2
// Per club, how many times each member has been manually captained
// within the phase. Max Captain chip weeks don't count toward any member.

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
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
