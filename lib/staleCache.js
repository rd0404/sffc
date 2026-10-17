// "Last good copy" cache in Netlify Blobs. Used so the site keeps working
// during the minutes after a gameweek deadline, when FPL's own API often
// errors or throttles: we serve the most recent successful copy instead of
// a 500. Failures here are always swallowed — the cache is best-effort.
const { getStore } = require("@netlify/blobs");

function cacheStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: "sffc-cache", siteID, token });
  return getStore("sffc-cache");
}

const lastWrite = new Map();

async function readStale(key) {
  try {
    return await cacheStore().get(encodeURIComponent(key), { type: "json" });
  } catch (_) {
    return null;
  }
}

// Writes at most once per `minGapMs` per key per warm instance.
async function writeGood(key, value, minGapMs = 120000) {
  const now = Date.now();
  if (now - (lastWrite.get(key) || 0) < minGapMs) return;
  lastWrite.set(key, now);
  try {
    await cacheStore().setJSON(encodeURIComponent(key), value);
  } catch (_) {
    /* best-effort */
  }
}

module.exports = { readStale, writeGood };
