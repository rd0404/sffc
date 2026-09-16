// Netlify Function — GET /.netlify/functions/clear-captains?event=5&adminPasskey=...
//
// Deletes every club's captain record for the given gameweek — useful
// for wiping test submissions before the real ones come in. Only clears
// the specified gameweek; other gameweeks are untouched.

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

  const store = captainsStore();
  const cleared = [];
  const skipped = [];

  for (const team of teamsConfig) {
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
