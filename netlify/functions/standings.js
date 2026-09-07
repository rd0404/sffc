// GET /.netlify/functions/standings?phase=1|2
// Finalized table for ONE phase only — Phase 2 doesn't carry over Phase 1.

const teamsConfig = require("../../lib/teamsConfig");
const { resultsStore } = require("../../lib/blobStore");
const { buildTable } = require("../../lib/standingsCalc");
const { getPhaseRange } = require("../../lib/phase");

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const phase = params.phase ? parseInt(params.phase, 10) : 1;
    const [start, end] = getPhaseRange(phase);

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
      if (data && data.results && data.event >= start && data.event <= end) {
        allResults.push(data.results);
      }
    }

    const standings = buildTable(teamsConfig, allResults);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standings, provisionalEvent: null, phase }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
