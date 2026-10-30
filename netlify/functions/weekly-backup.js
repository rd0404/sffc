// Runs every Sunday. Emails a full backup of all captain picks and saved
// results to ADMIN_EMAIL as a JSON attachment — a copy that lives outside
// Netlify, so a suspension or storage problem can't lose the data.
const { resultsStore } = require("../../lib/blobStore");
const { captainsStore } = require("../../lib/captainStore");
const { sendEmail } = require("../../lib/emailClient");

async function dump(store, prefix) {
  const out = {};
  const { blobs } = await store.list({ prefix });
  for (const b of blobs) out[b.key] = await store.get(b.key, { type: "json" });
  return out;
}

exports.handler = async () => {
  try {
    if (!process.env.ADMIN_EMAIL) return { statusCode: 200, body: "ADMIN_EMAIL not set - skipped" };
    const results = await dump(resultsStore(), "gw-");
    const captains = await dump(captainsStore(), "captain:");
    const exportedAt = new Date().toISOString();
    const day = exportedAt.slice(0, 10);
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `SFFC weekly backup ${day}`,
      html:
        `<p>Weekly backup attached: ${Object.keys(results).length} gameweek snapshots, ` +
        `${Object.keys(captains).length} captain records. Keep this email.</p>`,
      attachments: [
        {
          filename: `sffc-backup-${day}.json`,
          content: JSON.stringify({ exportedAt, results, captains }, null, 2),
          contentType: "application/json",
        },
      ],
    });
    return { statusCode: 200, body: "backup emailed" };
  } catch (err) {
    console.error("weekly-backup failed", err.message);
    return { statusCode: 500, body: err.message };
  }
};

exports.handler = require("../../lib/blobStore").wrapHandler(exports.handler);
