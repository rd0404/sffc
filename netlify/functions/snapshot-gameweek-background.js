// Netlify Scheduled Background Function (hourly, see netlify.toml).
// Locks every finished gameweek that isn't locked yet: the full Results page
// and the standings numbers are saved once, and never recalculated after.
// The gameweek FPL still calls "current" is never locked (bonus points can
// still shift); only a week superseded by the next one is.

const fplClient = require("../../lib/fplClient");
const { readLocked, computeAndLock } = require("../../lib/lockStore");

exports.handler = async () => {
  const bootstrap = await fplClient.getBootstrap();
  const currentEvent = fplClient.getCurrentEvent(bootstrap);
  const lockedNow = [];
  const skipped = {};

  for (let event = 1; event < currentEvent; event++) {
    if (await readLocked(event)) continue;
    try {
      const r = await computeAndLock(event);
      if (r.locked) lockedNow.push(event);
      else skipped[event] = r.reason;
    } catch (err) {
      skipped[event] = err.message;
    }
  }

  return { lockedNow, skipped };
};

// Lets this function use Netlify's automatic storage credentials.
exports.handler = require("../../lib/blobStore").wrapHandler(exports.handler);
