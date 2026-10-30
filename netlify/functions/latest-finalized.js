// Netlify Function — GET /.netlify/functions/latest-finalized
//
// Returns the highest gameweek number that has a permanent result
// snapshot stored. Used by the WhatsApp bot to detect "a new gameweek
// just finished" without needing to understand fixtures/live state itself.

const { resultsStore } = require("../../lib/blobStore");

exports.handler = async () => {
  try {
    const store = resultsStore();
    const { blobs } = await store.list({ prefix: "gw-" });

    let latestFinalized = null;
    for (const blobMeta of blobs) {
      const match = blobMeta.key.match(/^gw-(\d+)$/);
      if (!match) continue;
      const gw = parseInt(match[1], 10);
      if (latestFinalized == null || gw > latestFinalized) {
        latestFinalized = gw;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latestFinalized }),
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
