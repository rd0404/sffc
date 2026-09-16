// Netlify Function — GET /.netlify/functions/clear-captains?event=5&adminPasskey=...
// Optionally add &club=Arsenal to clear just that one club instead of
// every club for the gameweek.
//
// Deletes captain record(s) for the given gameweek — useful for wiping
// test submissions, or fixing a single club's mistaken entry, before the
// real one goes in. Only clears the specified gameweek (and club, if
// given); everything else is untouched.

const teamsConfig = require("../../lib/teamsConfig");
const { captainsStore, captainKey } = require("../../lib/captainStore");

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

  let targetTeams = teamsConfig;
  if (params.club) {
    const team = teamsConfig.find((t) => t.club === params.club);
    if (!team) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Unknown club '${params.club}'` }),
      };
    }
    targetTeams = [team];
  }

  const store = captainsStore();
  const cleared = [];
  const skipped = [];

  for (const team of targetTeams) {
    const key = captainKey(team.club, targetEvent);
    try {
      const existing = await store.get(key, { type: "json" });
      if (existing) {
        await store.delete(key);
        cleared.push(team.club);
      } else {
        skipped.push(team.club);
      }
    } catch (_) {
      skipped.push(team.club);
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: targetEvent, cleared, skipped }),
  };
};
