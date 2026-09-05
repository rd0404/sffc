// Wraps Netlify Blobs — a built-in key/value store, no external DB or
// signup needed. Each finished gameweek's results are stored once, under
// the key "gw-<number>", and never overwritten (the season history for a
// finished gameweek never changes).

const { getStore } = require("@netlify/blobs");

function resultsStore() {
  return getStore("sffc-results");
}

module.exports = { resultsStore };
