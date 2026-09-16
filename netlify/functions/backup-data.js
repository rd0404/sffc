// Netlify Function — GET /.netlify/functions/backup-data?adminPasskey=...
//
// Exports everything stored in Netlify Blobs — every finalized gameweek's
// results snapshot, and every captain record ever submitted — as one
// downloadable JSON file. This is the actual data that would be lost if
// something went wrong with Blobs; the site's code itself is already
// safe in GitHub, so this covers the other half.
//
// Run this periodically (e.g. after each gameweek finalizes) and save
// the downloaded file somewhere safe (Google Drive, email it to
// yourself, etc.) as a manual backup.

const { resultsStore } = require("../../lib/blobStore");
const { captainsStore } = require("../../lib/captainStore");

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const isAdmin = params.adminPasskey === (process.env.ADMIN_PASSKEY || "sffcadmins");
    if (!isAdmin) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Incorrect admin passkey" }),
      };
    }

    const results = {};
    const rStore = resultsStore();
    const { blobs: resultBlobs } = await rStore.list({ prefix: "gw-" });
    for (const b of resultBlobs) {
      try {
        results[b.key] = await rStore.get(b.key, { type: "json" });
      } catch (_) {
        // skip unreadable entries rather than failing the whole export
      }
    }

    const captains = {};
    const cStore = captainsStore();
    const { blobs: captainBlobs } = await cStore.list({ prefix: "captain:" });
    for (const b of captainBlobs) {
      try {
        captains[b.key] = await cStore.get(b.key, { type: "json" });
      } catch (_) {
        // skip unreadable entries
      }
    }

    const exportedAt = new Date().toISOString();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="sffc-backup-${exportedAt.slice(0, 10)}.json"`,
      },
      body: JSON.stringify({ exportedAt, results, captains }, null, 2),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
