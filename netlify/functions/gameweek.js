// Netlify Function — GET /.netlify/functions/gameweek?event=N
//
// Returns the given gameweek's (or current, if omitted) fixture-derived
// matchups and scores for all 20 SFFC teams, with the captain doubling
// rule applied, and TRUE minute-by-minute live scoring for the current
// gameweek (see lib/managerData.js).

const { readStale, writeGood } = require("../../lib/staleCache");
const { computeGameweek } = require("../../lib/gameweekView");
const { readLocked, saveLock } = require("../../lib/lockStore");

// Wrapper: if the live computation fails (usually FPL erroring right after a
// deadline), serve the last good copy for that gameweek, flagged as stale,
// rather than a 500.
exports.handler = async (evt) => {
  const params = (evt && evt.queryStringParameters) || {};

  // A finished gameweek is frozen: serve the saved copy, never recalculate.
  if (params.event && /^\d+$/.test(params.event)) {
    const frozen = await readLocked(parseInt(params.event, 10));
    if (frozen) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(frozen),
      };
    }
  }

  const cacheKey = "gameweek:" + (params.event || "current");
  const res = await computeGameweek(evt);
  if (res.statusCode === 200) {
    try {
      const body = JSON.parse(res.body);
      // First time a finished week is viewed, freeze it (only if fully safe).
      if (body.event < body.currentEvent) {
        try {
          const r = await saveLock(body.event, body);
          if (r.locked) body.isLocked = true;
        } catch (_) {}
      }
      if (body.matches && body.matches.length) {
        await writeGood(cacheKey, body, 60000);
        // "current" and the explicit number share data; keep both warm
        if (!params.event) await writeGood("gameweek:" + body.event, body, 60000);
      }
    } catch (_) {}
    return res;
  }
  const stale = await readStale(cacheKey);
  if (stale) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...stale, stale: true }),
    };
  }
  return res;
};

// Lets this function use Netlify's automatic storage credentials.
exports.handler = require("../../lib/blobStore").wrapHandler(exports.handler);
