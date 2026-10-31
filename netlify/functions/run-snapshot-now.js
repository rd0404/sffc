// Netlify Function — GET /.netlify/functions/run-snapshot-now
//
// Locks any finished gameweek that isn't locked yet (same as the hourly job,
// but you can trigger it by visiting the URL). Safe to run repeatedly: each
// run saves whatever it finishes, and locked weeks are never touched.
//
// ?relock=4,5&adminPasskey=...  -> recalculates those weeks and REPLACES their
// locked copy. The new copy is calculated first; if that fails, the existing
// locked copy stays exactly as it was. (?force= works the same way.)

const fplClient = require("../../lib/fplClient");
const { readLocked, computeAndLock } = require("../../lib/lockStore");

exports.handler = async (evt) => {
  try {
    const params = evt.queryStringParameters || {};
    const bootstrap = await fplClient.getBootstrap();
    const currentEvent = fplClient.getCurrentEvent(bootstrap);

    const relocked = [];
    const lockedNow = [];
    const skipped = {};

    const relockList = String(params.relock || params.force || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n < currentEvent);

    if (relockList.length) {
      if (params.adminPasskey !== (process.env.ADMIN_PASSKEY || "sffcadmins")) {
        return {
          statusCode: 401,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Relocking needs &adminPasskey=..." }),
        };
      }
      for (const event of relockList) {
        try {
          const r = await computeAndLock(event, { overwrite: true });
          if (r.locked) relocked.push(event);
          else skipped[event] = r.reason;
        } catch (err) {
          skipped[event] = err.message;
        }
      }
    }

    for (let event = 1; event < currentEvent; event++) {
      if (relockList.includes(event)) continue;
      if (await readLocked(event)) continue;
      try {
        const r = await computeAndLock(event);
        if (r.locked) lockedNow.push(event);
        else skipped[event] = r.reason;
      } catch (err) {
        skipped[event] = err.message;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relocked, lockedNow, skipped, currentEvent }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// Lets this function use Netlify's automatic storage credentials.
exports.handler = require("../../lib/blobStore").wrapHandler(exports.handler);
