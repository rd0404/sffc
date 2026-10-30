// Netlify Function — GET /.netlify/functions/chip-usage
//
// Which clubs have used their once-per-phase Max Captain chip, and in
// which gameweek — derived entirely from stored captain records, no
// separate tracking needed.

const teamsConfig = require("../../lib/teamsConfig");
const { listAllCaptainRecords } = require("../../lib/captainStore");
const { getPhaseForEvent } = require("../../lib/phase");

exports.handler = async () => {
  try {
    const all = await listAllCaptainRecords();

    const usage = {};
    teamsConfig.forEach((t) => {
      usage[t.club] = { club: t.club, phase1Used: null, phase2Used: null };
    });

    for (const [name, data] of Object.entries(all)) {
      if (!data || !data.maxChip) continue;
      const i = name.lastIndexOf(":");
      const club = name.slice(0, i);
      const gw = parseInt(name.slice(i + 1), 10);
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

// Lets this function use Netlify's automatic storage credentials.
exports.handler = require("../../lib/blobStore").wrapHandler(exports.handler);
