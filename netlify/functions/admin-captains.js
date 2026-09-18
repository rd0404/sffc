// Netlify Function — GET /.netlify/functions/admin-captains?event=5&adminPasskey=...
//
// Unlike /api/captain (which hides who's submitted until the deadline
// passes, for fairness between clubs), this shows the real, current
// submission status for every club right now — meant for admin use only,
// to see who still needs a nudge before a deadline.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { getCaptainRecord } = require("../../lib/captainStore");

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const isAdmin = params.adminPasskey === (process.env.ADMIN_PASSKEY || "sffcadmins");
  if (!isAdmin) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Incorrect admin passkey" }),
    };
  }

  const targetEvent = params.event ? parseInt(params.event, 10) : null;
  if (!targetEvent) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing required 'event' query parameter" }),
    };
  }

  const rows = await Promise.all(
    teamsConfig.map(async (team) => {
      const record = await getCaptainRecord(team.club, targetEvent);

      if (!record) {
        return { club: team.club, submitted: false, captain: null, submittedAt: null };
      }

      if (record.maxChip) {
        return {
          club: team.club,
          submitted: true,
          captain: "Max Captain chip",
          submittedAt: record.submittedAt || null,
        };
      }

      let captainLabel = "Unknown manager";
      try {
        const standings = await fplClient.getLeagueStandings(team.leagueId);
        const m = standings.standings.results.find((x) => x.entry === record.managerEntry);
        if (m) captainLabel = `${m.player_name} (${m.entry_name})`;
      } catch (_) {
        // leave as "Unknown manager" if the FPL lookup fails
      }

      return {
        club: team.club,
        submitted: true,
        captain: captainLabel,
        submittedAt: record.submittedAt || null,
      };
    })
  );

  const submittedCount = rows.filter((r) => r.submitted).length;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: targetEvent,
      submittedCount,
      totalClubs: teamsConfig.length,
      teams: rows,
    }),
  };
};
