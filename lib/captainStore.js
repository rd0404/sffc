// Netlify Blobs store for SFFC-level captain selections — separate from
// each manager's own personal FPL captain. One record per club per gameweek:
//   { managerEntry: 12345, submittedAt: "..." }   — manual pick, or
//   { maxChip: true, submittedAt: "..." }         — Max Captain chip used
//
// No record at all means "not yet submitted". A storage FAILURE is thrown
// (it used to be read as "no record").
//
// KEY FORMAT: new records use a plain key with no special characters
// (e.g. "cap-nottmforest-9"). Older records were saved under keys containing
// the club name with spaces/apostrophes ("captain:Nott'm%20Forest:9"), and
// different versions of the Netlify library encode those differently — which
// made clubs like "Nott'm Forest" and "Man City" read as empty. Reads still
// find every legacy form, and move what they find to the plain key.
const { openStore } = require("./blobStore");
const teamsConfig = require("./teamsConfig");

function captainsStore() {
  return openStore("sffc-captains");
}

function slugOf(club) {
  return String(club).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function slugKey(club, event) {
  return `cap-${slugOf(club)}-${event}`;
}

// Every older spelling this record might be stored under.
function legacyKeys(club, event) {
  const enc = `captain:${encodeURIComponent(club)}:${event}`;
  const keys = [
    enc,
    `captain:${encodeURIComponent(encodeURIComponent(club))}:${event}`,
    `captain:${club}:${event}`,
  ];
  return [...new Set(keys)];
}

// Kept for older callers; this is the plain key new records are saved under.
function captainKey(club, event) {
  return slugKey(club, event);
}

async function getCaptainRecord(club, event) {
  const store = captainsStore();
  const primary = await store.get(slugKey(club, event), { type: "json" });
  if (primary) return primary;
  for (const key of legacyKeys(club, event)) {
    let rec = null;
    try {
      rec = await store.get(key, { type: "json" });
    } catch (_) {
      continue;
    }
    if (rec) {
      try {
        await store.setJSON(slugKey(club, event), rec); // move to the plain key
      } catch (_) {}
      return rec;
    }
  }
  return null;
}

async function setCaptainRecord(club, event, record) {
  await captainsStore().setJSON(slugKey(club, event), record);
}

// Removes the record under every spelling, so an old copy can't reappear.
async function deleteCaptainRecord(club, event) {
  const store = captainsStore();
  let removed = false;
  for (const key of [slugKey(club, event), ...legacyKeys(club, event)]) {
    try {
      const existing = await store.get(key, { type: "json" });
      if (existing) {
        await store.delete(key);
        removed = true;
      }
    } catch (_) {}
  }
  return removed;
}

function tryDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
}

// Works out which club + gameweek a stored key belongs to (null if unknown).
function parseKey(key) {
  let m = /^cap-([a-z0-9]+)-(\d+)$/.exec(key);
  if (m) {
    const team = teamsConfig.find((t) => slugOf(t.club) === m[1]);
    return team ? { club: team.club, gw: parseInt(m[2], 10) } : null;
  }
  if (key.startsWith("captain:")) {
    const i = key.lastIndexOf(":");
    const gw = parseInt(key.slice(i + 1), 10);
    let name = key.slice("captain:".length, i);
    for (let n = 0; n < 3; n++) {
      const team = teamsConfig.find((t) => t.club === name);
      if (team) return { club: team.club, gw };
      name = tryDecode(name);
    }
  }
  return null;
}

// Every stored captain record, as { "<club>:<gw>": record } — used by backups
// and the Max Captain chip tracker.
async function listAllCaptainRecords() {
  const store = captainsStore();
  const keys = [];
  for (const prefix of ["cap-", "captain:"]) {
    const { blobs } = await store.list({ prefix });
    for (const b of blobs) keys.push(b.key);
  }
  const out = {};
  for (const key of keys) {
    const id = parseKey(key);
    if (!id) continue;
    const name = `${id.club}:${id.gw}`;
    if (out[name]) continue;
    let rec = await getCaptainRecord(id.club, id.gw);
    if (!rec) {
      for (const k of [key, tryDecode(key), encodeURIComponent(key)]) {
        try {
          rec = await store.get(k, { type: "json" });
        } catch (_) {}
        if (rec) break;
      }
    }
    if (rec) out[name] = rec;
  }
  return out;
}

module.exports = {
  captainsStore,
  captainKey,
  getCaptainRecord,
  setCaptainRecord,
  deleteCaptainRecord,
  listAllCaptainRecords,
};
