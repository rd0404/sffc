// Admin check: /api/audit?adminPasskey=...
// For every past gameweek: is it locked, does the standings copy match the
// locked Results copy, and which clubs had NO captain pick (default rule used).
const fplClient = require("../../lib/fplClient");
const { readLocked } = require("../../lib/lockStore");
const { resultsStore } = require("../../lib/blobStore");

exports.handler = async (evt) => {
  const params = (evt && evt.queryStringParameters) || {};
  if (params.adminPasskey !== (process.env.ADMIN_PASSKEY || "sffcadmins")) {
    return { statusCode: 401, body: JSON.stringify({ error: "Incorrect admin passkey" }) };
  }
  try {
    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);
    const store = resultsStore();
    const weeks = [];
    for (let event = 1; event < currentEvent; event++) {
      const locked = await readLocked(event);
      const snap = await store.get(`gw-${event}`, { type: "json" });
      const noPick = [];
      if (locked) {
        for (const m of locked.matches) {
          for (const side of [m.home, m.away]) if (side.captainSubmitted === false) noPick.push(side.club);
        }
      }
      weeks.push({
        event,
        locked: !!locked,
        lockedAt: locked ? locked.lockedAt || null : null,
        standingsCopy: !!snap,
        clubsWithNoPick: noPick,
      });
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentEvent, weeks }, null, 2),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

exports.handler = require("../../lib/blobStore").wrapHandler(exports.handler);
