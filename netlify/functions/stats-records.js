// GET /.netlify/functions/stats-records?phase=1|2
// Top/bottom scoring week counts per club within a phase.

const teamsConfig = require("../../lib/teamsConfig");
const { resultsStore } = require("../../lib/blobStore");
const { getPhaseRange } = require("../../lib/phase");

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const phase = params.phase ? parseInt(params.phase, 10) : 1;
    const [start, end] = getPhaseRange(phase);

    const store = resultsStore();
    const { blobs } = await store.list({ prefix: "gw-" });

    const topCount = {};
    const bottomCount = {};
    teamsConfig.forEach((t) => {
      topCount[t.club] = 0;
      bottomCount[t.club] = 0;
    });

    for (const blobMeta of blobs) {
      let data = null;
      try {
        data = await store.get(blobMeta.key, { type: "json" });
      } catch (_) {
        continue;
      }
      if (!data || !data.results || data.event < start || data.event > end) continue;

      const scores = [];
      data.results.forEach((r) => {
        scores.push({ club: r.home, score: r.homeScore });
        scores.push({ club: r.away, score: r.awayScore });
      });
      if (!scores.length) continue;

      const maxScore = Math.max(...scores.map((s) => s.score));
      const minScore = Math.min(...scores.map((s) => s.score));
      scores.forEach((s) => {
        if (s.score === maxScore) topCount[s.club] += 1;
        if (s.score === minScore) bottomCount[s.club] += 1;
      });
    }

    const teamsOut = teamsConfig.map((t) => ({
      club: t.club,
      topWeeks: topCount[t.club],
      bottomWeeks: bottomCount[t.club],
    }));
    teamsOut.sort((a, b) => b.topWeeks - a.topWeeks);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, teams: teamsOut }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
