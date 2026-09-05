// Wraps Netlify Blobs — a built-in key/value store, no external DB or
// signup needed. Each finished gameweek's results are stored once, under
// the key "gw-<number>", and never overwritten (the season history for a
// finished gameweek never changes).

const { getStore } = require("@netlify/blobs");

function resultsStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  // Automatic configuration doesn't always work for scheduled/background
  // functions, so fall back to explicit siteID + token (set as env vars
  // in Netlify site settings) when available.
  if (siteID && token) {
    return getStore({ name: "sffc-results", siteID, token });
  }

  return getStore("sffc-results");
}

module.exports = { resultsStore };
