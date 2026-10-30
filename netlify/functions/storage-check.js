// Runs every 6 hours. If the site can't read/write its saved data (Netlify
// Blobs), emails the admin so it's fixed before managers notice.
//
// Manual check (admin): /api/storage-check?adminPasskey=...  → shows which
// credential path works (automatic vs. manual token).
const { probe, storageErrorResponse } = require("../../lib/blobStore");
const { sendEmail } = require("../../lib/emailClient");

const STORES = ["sffc-captains", "sffc-results"];

exports.handler = async (event) => {
  const params = (event && event.queryStringParameters) || {};
  const manual = params.adminPasskey !== undefined;
  if (manual && params.adminPasskey !== (process.env.ADMIN_PASSKEY || "sffcadmins")) {
    return { statusCode: 401, body: JSON.stringify({ error: "Incorrect admin passkey" }) };
  }

  const report = {};
  let healthy = true;
  for (const name of STORES) {
    report[name] = await probe(name);
    const r = report[name];
    if (r.automatic !== "ok" && r.manualToken !== "ok") healthy = false;
  }

  if (!healthy && !manual && process.env.ADMIN_EMAIL) {
    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: "SFFC site: saved data can't be read",
        html:
          "<p>The SFFC site can't reach its stored data (captain picks, saved results). " +
          "Captain Count, Standings and Submit Captain will show errors until this is fixed.</p>" +
          "<p>Most likely fix: Netlify → User settings → Applications → create a new personal access token, " +
          "update <b>NETLIFY_BLOBS_TOKEN</b> in the site's environment variables, then redeploy. " +
          "Also check Netlify for any billing or usage notice.</p>" +
          `<pre>${JSON.stringify(report, null, 2)}</pre>`,
      });
    } catch (e) {
      console.error("storage-check: could not send alert email", e.message);
    }
  }

  return {
    statusCode: healthy ? 200 : 503,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ healthy, report }),
  };
};

exports.handler = require("../../lib/blobStore").wrapHandler(exports.handler);
