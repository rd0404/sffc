// Admin diagnostic: /api/storage-status?adminPasskey=...
// Shows whether the site's saved data is readable and which credentials work.
const { probe } = require("../../lib/blobStore");

exports.handler = async (event) => {
  const params = (event && event.queryStringParameters) || {};
  if (params.adminPasskey !== (process.env.ADMIN_PASSKEY || "sffcadmins")) {
    return { statusCode: 401, body: JSON.stringify({ error: "Incorrect admin passkey" }) };
  }
  const report = {};
  let healthy = true;
  for (const name of ["sffc-captains", "sffc-results"]) {
    report[name] = await probe(name);
    if (report[name].automatic !== "ok" && report[name].manualToken !== "ok") healthy = false;
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ healthy, report }, null, 2),
  };
};

exports.handler = require("../../lib/blobStore").wrapHandler(exports.handler);
