// Netlify Blobs store for SFFC-level captain selections — separate from
// each manager's own personal FPL captain. One record per club per gameweek:
//   { managerEntry: 12345, submittedAt: "..." }   — manual pick, or
//   { maxChip: true, submittedAt: "..." }         — Max Captain chip used
//
// No record at all means "not yet submitted". A storage FAILURE is now thrown
// (it used to be read as "no record"), so a broken connection shows an error
// instead of silently showing 0 captains or saving wrongly-scored results.
const { openStore } = require("./blobStore");

function captainsStore() {
  return openStore("sffc-captains");
}

function captainKey(club, event) {
  return `captain:${encodeURIComponent(club)}:${event}`;
}

async function getCaptainRecord(club, event) {
  return await captainsStore().get(captainKey(club, event), { type: "json" });
}

async function setCaptainRecord(club, event, record) {
  await captainsStore().setJSON(captainKey(club, event), record);
}

module.exports = { captainsStore, captainKey, getCaptainRecord, setCaptainRecord };
