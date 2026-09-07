// GET /.netlify/functions/chip-usage
// Which clubs have used their once-per-phase Max Captain chip, and when.

const teamsConfig = require("../../lib/teamsConfig");
const { captainsStore } = require("../../lib/captainStore");
const { getPhaseForEvent } = require("../../lib/phase");

exports.handler = async () => {
  try {
    const store = captainsStore();
    const { blobs } = await store.list({ prefix: "captain:" });

    const usage = {};
    teamsConfig.forEach((t) => {
      usage[t.club] = { club: t.club, phase1Used: null, phase2Used: null };
    });

    for (const blobMeta of blobs) {
      let data = null;
      try {
        data = await store.get(blobMeta.key, { type: "json" });
      } catch (_) {
        continue;
      }
      if (!data || !data.maxChip) continue;

      const parts = blobMeta.key.split(":");
      const club = decodeURIComponent(parts[1]);
      const gw = parseInt(parts[2], 10);
      if (!usage[club]) continue;

      if (getPhaseForEvent(gw) === 1) usage[club].phase1Used = gw;
      else usage[club].phase2Used = gw;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teams: Object.values(usage) }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
