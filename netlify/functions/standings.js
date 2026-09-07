// Netlify Function — GET /.netlify/functions/standings?phase=1|2
//
// Finalized table for ONE phase only (GW1-19 or GW20-38) — Phase 2 does
// not carry over Phase 1's results. Each row also includes
// "previousPosition" — the club's rank with the most recent gameweek's
// result excluded, so the frontend can show a movement arrow.

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

    const pairs = [];
    for (const blobMeta of blobs) {
      let data = null;
      try {
        data = await store.get(blobMeta.key, { type: "json" });
      } catch (_) {
        continue;
      }
      if (data && data.results && data.event >= start && data.event <= end) {
        pairs.push({ event: data.event, results: data.results });
      }
    }

    const fullTable = buildTable(teamsConfig, pairs.map((p) => p.results));

    const latestEvent = pairs.length ? Math.max(...pairs.map((p) => p.event)) : null;
    const prevPairs = pairs.filter((p) => p.event < latestEvent);
    const prevTable = buildTable(teamsConfig, prevPairs.map((p) => p.results));
    const prevPositionByClub = {};
    prevTable.forEach((row, i) => {
      prevPositionByClub[row.club] = i + 1;
    });

    const standings = fullTable.map((row, i) => ({
      ...row,
      previousPosition: prevPairs.length ? prevPositionByClub[row.club] || null : null,
    }));

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
