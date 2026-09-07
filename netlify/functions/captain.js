// GET  ?club=Arsenal&event=3  -> the club's 6 managers + current submission.
// POST { club, event, managerEntry } -> submit a manual captain pick.
// POST { club, event, maxChip: true } -> use the Max Captain chip.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { getCaptainRecord, setCaptainRecord } = require("../../lib/captainStore");

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const club = body.club;
      const gw = body.event;

      if (!club || !gw) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "club and event are required" }),
        };
      }

      const team = teamsConfig.find((t) => t.club === club);
      if (!team) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: `Unknown club '${club}'` }),
        };
      }

      let record;
      if (body.maxChip) {
        record = { maxChip: true, submittedAt: new Date().toISOString() };
      } else {
        if (!body.managerEntry) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "managerEntry is required unless maxChip is set" }),
          };
        }
        const standings = await fplClient.getLeagueStandings(team.leagueId);
        const valid = standings.standings.results.some((m) => m.entry === body.managerEntry);
        if (!valid) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "That manager is not one of this club's 6 members" }),
          };
        }
        record = { managerEntry: body.managerEntry, submittedAt: new Date().toISOString() };
      }

      await setCaptainRecord(club, gw, record);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, record }),
      };
    }

    const params = event.queryStringParameters || {};
    const club = params.club;
    const gw = params.event ? parseInt(params.event, 10) : null;

    if (!club || !gw) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "club and event query params are required" }),
      };
    }

    const team = teamsConfig.find((t) => t.club === club);
    if (!team) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Unknown club '${club}'` }),
      };
    }

    const standings = await fplClient.getLeagueStandings(team.leagueId);
    const managers = standings.standings.results.map((m) => ({
      entry: m.entry,
      teamName: m.entry_name,
      managerName: m.player_name,
    }));

    const record = await getCaptainRecord(club, gw);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ club, event: gw, managers, record: record || null }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
