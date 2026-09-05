// Netlify Function — GET /.netlify/functions/standings
//
// Finalized season table only: reads every finished-gameweek snapshot
// stored by snapshot-gameweek-background.js. Does NOT include the current
// in-progress gameweek — see /api/standings-live for that.

const teamsConfig = require("../../lib/teamsConfig");
const { resultsStore } = require("../../lib/blobStore");
const { buildTable } = require("../../lib/standingsCalc");

exports.handler = async () => {
  try {
    const store = resultsStore();
    const { blobs } = await store.list({ prefix: "gw-" });

    const allResults = [];
    for (const blobMeta of blobs) {
      let data = null;
      try {
        data = await store.get(blobMeta.key, { type: "json" });
      } catch (_) {
        continue;
      }
      if (data && data.results) allResults.push(data.results);
    }

    const standings = buildTable(teamsConfig, allResults);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standings, provisionalEvent: null }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
