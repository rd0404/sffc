// Netlify Blobs store for SFFC-level captain selections — separate from
// each manager's own personal FPL captain (a different concept entirely).
// One record per club per gameweek:
//   { managerEntry: 12345, submittedAt: "..." }   — manual pick, or
//   { maxChip: true, submittedAt: "..." }         — Max Captain chip used
//
// No record means "not yet submitted" — scoring falls back to the
// rulebook default (lowest scorer auto-captained).

const { getStore } = require("@netlify/blobs");

function captainsStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: "sffc-captains", siteID, token });
  }
  return getStore("sffc-captains");
}

function captainKey(club, event) {
  return `captain:${encodeURIComponent(club)}:${event}`;
}

async function getCaptainRecord(club, event) {
  const store = captainsStore();
  try {
    return await store.get(captainKey(club, event), { type: "json" });
  } catch (_) {
    return null;
  }
}

async function setCaptainRecord(club, event, record) {
  const store = captainsStore();
  await store.setJSON(captainKey(club, event), record);
}

module.exports = { captainsStore, captainKey, getCaptainRecord, setCaptainRecord };
