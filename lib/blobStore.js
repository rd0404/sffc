// Single place that opens every Netlify Blobs store.
//
// Credentials, in order:
//   1. Netlify's automatic credentials (needs connectLambda(event) at the start
//      of each function — wrapHandler below does that). Nothing to expire.
//   2. The manual NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN env vars, as a fallback.
// If the first fails for any reason, the same call is retried on the second.
const { getStore, connectLambda } = require("@netlify/blobs");

function connect(event) {
  try {
    if (event && event.blobs) connectLambda(event);
  } catch (_) {
    /* fall back to the token */
  }
}

function wrapHandler(fn) {
  return async function (event, context) {
    connect(event);
    return fn(event, context);
  };
}

function manualOpts(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  return siteID && token ? { name, siteID, token } : null;
}

const METHODS = ["get", "getWithMetadata", "getMetadata", "set", "setJSON", "delete", "list"];

function openStore(name) {
  const candidates = [];
  try {
    candidates.push(() => getStore(name));
  } catch (_) {}
  const manual = manualOpts(name);
  if (manual) candidates.push(() => getStore(manual));

  const out = {};
  for (const m of METHODS) {
    out[m] = async (...args) => {
      let firstErr = null;
      for (const make of candidates) {
        try {
          return await make()[m](...args);
        } catch (err) {
          if (!firstErr) firstErr = err;
        }
      }
      throw firstErr || new Error("Netlify Blobs is not configured");
    };
  }
  return out;
}

// Tests each credential path separately (used by storage-check).
async function probe(name) {
  const result = { automatic: "failed", manualToken: "not set" };
  try {
    await getStore(name).list({ prefix: "__probe__" });
    result.automatic = "ok";
  } catch (e) {
    result.automaticError = e.message;
  }
  const manual = manualOpts(name);
  if (manual) {
    try {
      await getStore(manual).list({ prefix: "__probe__" });
      result.manualToken = "ok";
    } catch (e) {
      result.manualToken = "failed";
      result.manualTokenError = e.message;
    }
  }
  return result;
}

function resultsStore() {
  return openStore("sffc-results");
}

// A readable response when storage itself is the problem (null otherwise).
function storageErrorResponse(err) {
  const msg = String((err && err.message) || err || "");
  if (!/blobs|401|403|unauthor|forbidden|credential|not configured/i.test(msg)) return null;
  return {
    statusCode: 503,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageDown: true,
      error:
        "Saved league data can't be read right now (storage access problem). Nothing is lost - the admin has been alerted.",
    }),
  };
}

module.exports = { openStore, resultsStore, connect, wrapHandler, probe, storageErrorResponse };
