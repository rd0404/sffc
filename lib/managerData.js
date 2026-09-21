// Shared by /api/gameweek, /api/team-of-week, /api/compare, /api/standings-live,
// and the season snapshot job.
//
// LIVE SCORING, done properly: for the CURRENT gameweek, we don't just
// sum (starting XI player's live points x multiplier). We simulate FPL's
// actual auto-substitution rule:
//   - If a starting player has recorded 0 minutes AND their real match
//     has finished (or is provisionally over), FPL automatically brings
//     in a bench replacement -- following the bench priority order the
//     manager set, and only if the swap keeps a valid formation
//     (>=1 GK, >=3 DEF, >=2 MID, >=1 FWD).
//   - The reserve keeper can only ever replace the starting keeper.
//   - If the captain themselves records 0 minutes (match over), the
//     armband moves to the vice-captain instead -- preserving whatever
//     chip multiplier was active (2x normally, 3x for Triple Captain).
//
// Without this, a manager whose starter got injured/rested would be
// under-scored live, since the bench upgrade wouldn't be reflected until
// FPL's own official numbers settled after the fact.
//
// For a FINISHED past gameweek, entry_history.points is already FPL's
// own final, fully-processed number (subs and all) -- so that simpler
// path is still used there.

const fplClient = require("./fplClient");
const { getCaptainRecord } = require("./captainStore");
const { buildFixtureLookups } = require("./fixtures");

const MIN_REQUIRED = { 1: 1, 2: 3, 3: 2, 4: 1 }; // GK, DEF, MID, FWD

// Fetch once per request, pass down through the call chain below. Bundles
// everything the live auto-sub simulation needs, built from a single
// live-data + fixtures fetch.
async function buildLiveContext(bootstrap, event) {
  const liveData = await fplClient.getEventLive(event);
  const liveElementsMap = {};
  liveData.elements.forEach((el) => {
    liveElementsMap[el.id] = { points: el.stats.total_points, minutes: el.stats.minutes };
  });

  const elementTypeById = {};
  const clubOfElement = {};
  bootstrap.elements.forEach((el) => {
    elementTypeById[el.id] = el.element_type;
    clubOfElement[el.id] = el.team;
  });

  const fixtures = await fplClient.getFixtures(event);
  const { opponentOf, fixtureStatusOf } = buildFixtureLookups(fixtures);

  return { liveElementsMap, elementTypeById, clubOfElement, fixtureStatusOf, opponentOf };
}

// True once we can be confident a starter's 0 minutes means "won't play
// this gameweek" (their match is over), rather than "hasn't kicked off
// yet" (where 0 minutes is just the default and no sub should trigger).
function matchDecided(elementId, liveContext) {
  const clubId = liveContext.clubOfElement[elementId];
  const status = liveContext.fixtureStatusOf[clubId];
  return status === "finished" || status === "provisional";
}

function simulateEffectiveXI(picks, liveContext) {
  const { liveElementsMap, elementTypeById } = liveContext;
  const minutesOf = (id) => (liveElementsMap[id] ? liveElementsMap[id].minutes : 0);
  const pointsOf = (id) => (liveElementsMap[id] ? liveElementsMap[id].points : 0);
  const subEligible = (id) => minutesOf(id) === 0 && matchDecided(id, liveContext);

  const starters = picks
    .filter((p) => p.position <= 11)
    .map((p) => ({
      element: p.element,
      type: elementTypeById[p.element],
      multiplier: p.multiplier,
      isCaptain: p.is_captain,
      isVice: p.is_vice_captain,
      benched: false,
    }));

  const bench = picks
    .filter((p) => p.position > 11)
    .sort((a, b) => a.position - b.position)
    .map((p) => ({ element: p.element, type: elementTypeById[p.element] }));

  let xi = [...starters];
  const usedBenchIds = new Set();

  function countByType() {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0 };
    xi.forEach((p) => {
      if (!p.benched) c[p.type] = (c[p.type] || 0) + 1;
    });
    return c;
  }

  for (const starter of xi) {
    if (starter.benched) continue;
    if (!subEligible(starter.element)) continue;

    if (starter.type === 1) {
      const gkSub = bench.find((b) => b.type === 1 && !usedBenchIds.has(b.element));
      if (gkSub && minutesOf(gkSub.element) > 0) {
        starter.benched = true;
        usedBenchIds.add(gkSub.element);
        xi.push({ element: gkSub.element, type: 1, multiplier: 1, isCaptain: false, isVice: false, benched: false });
      }
      continue;
    }

    for (const cand of bench) {
      if (cand.type === 1) continue;
      if (usedBenchIds.has(cand.element)) continue;
      if (minutesOf(cand.element) === 0) continue;

      const counts = countByType();
      counts[starter.type] -= 1;
      counts[cand.type] = (counts[cand.type] || 0) + 1;
      if (
        counts[1] >= MIN_REQUIRED[1] &&
        counts[2] >= MIN_REQUIRED[2] &&
        counts[3] >= MIN_REQUIRED[3] &&
        counts[4] >= MIN_REQUIRED[4]
      ) {
        starter.benched = true;
        usedBenchIds.add(cand.element);
        xi.push({ element: cand.element, type: cand.type, multiplier: 1, isCaptain: false, isVice: false, benched: false });
        break;
      }
    }
  }

  const finalXI = xi.filter((p) => !p.benched);

  // Captain armband reassignment -- only if the captain's own match has
  // actually decided their 0 minutes (not just "hasn't played yet").
  const captain = starters.find((p) => p.isCaptain);
  const vice = starters.find((p) => p.isVice);
  let captainElement = captain ? captain.element : null;
  if (captain && subEligible(captain.element) && vice && minutesOf(vice.element) > 0) {
    captainElement = vice.element;
  }
  const captainMultiplier = captain ? captain.multiplier : 2;

  let total = 0;
  finalXI.forEach((p) => {
    const mult = p.element === captainElement ? captainMultiplier : 1;
    total += pointsOf(p.element) * mult;
  });

  return total;
}

// Net (hit-adjusted) points for one manager in one gameweek.
async function getManagerNetPoints(entryId, event, currentEvent, liveContext) {
  if (event === currentEvent && liveContext) {
    const picks = await fplClient.getEntryPicks(entryId, event);
    const rawPoints = simulateEffectiveXI(picks.picks, liveContext);
    const cost = picks.entry_history ? picks.entry_history.event_transfers_cost : 0;
    const totalPoints = picks.entry_history ? picks.entry_history.total_points : null;
    return { gwPoints: rawPoints - cost, totalPoints };
  }

  if (event === currentEvent) {
    const picks = await fplClient.getEntryPicks(entryId, event);
    const eh = picks.entry_history;
    return { gwPoints: eh.points - eh.event_transfers_cost, totalPoints: eh.total_points };
  }

  const history = await fplClient.getEntryHistory(entryId);
  const row = history.current.find((h) => h.event === event);
  if (!row) return { gwPoints: 0, totalPoints: null };
  return { gwPoints: row.points - row.event_transfers_cost, totalPoints: row.total_points };
}

async function getClubScoreForEvent(team, event, currentEvent, getStandings, liveContext) {
  const data = await getStandings(team);
  let score = 0;
  for (const m of data.standings.results) {
    const { gwPoints } = await getManagerNetPoints(m.entry, event, currentEvent, liveContext);
    score += gwPoints;
  }
  return score;
}

async function getManagerBreakdown(team, event, currentEvent, standingsData, liveContext) {
  const managers = [];
  for (const m of standingsData.standings.results) {
    const { gwPoints, totalPoints } = await getManagerNetPoints(m.entry, event, currentEvent, liveContext);
    managers.push({
      entry: m.entry,
      teamName: m.entry_name,
      managerName: m.player_name,
      club: team.club,
      gwPoints,
      totalPoints: totalPoints != null ? totalPoints : m.total,
    });
  }
  return managers;
}

async function getClubScoreWithCaptain(team, event, currentEvent, getStandings, liveContext) {
  const standingsData = await getStandings(team);
  const managers = await getManagerBreakdown(team, event, currentEvent, standingsData, liveContext);
  const rawSum = managers.reduce((sum, m) => sum + m.gwPoints, 0);

  const captainRecord = await getCaptainRecord(team.club, event);

  let captainEntry = null;
  let captainPoints = null;
  let usedMaxChip = false;

  if (captainRecord && captainRecord.maxChip) {
    const best = managers.reduce((a, b) => (b.gwPoints > a.gwPoints ? b : a), managers[0]);
    captainEntry = best.entry;
    captainPoints = best.gwPoints;
    usedMaxChip = true;
  } else if (captainRecord && captainRecord.managerEntry) {
    const chosen = managers.find((m) => m.entry === captainRecord.managerEntry);
    if (chosen) {
      captainEntry = chosen.entry;
      captainPoints = chosen.gwPoints;
    }
  }

  if (captainEntry == null) {
    const worst = managers.reduce((a, b) => (b.gwPoints < a.gwPoints ? b : a), managers[0]);
    captainEntry = worst.entry;
    captainPoints = worst.gwPoints;
  }

  return {
    total: rawSum + captainPoints,
    rawSum,
    captainEntry,
    captainPoints,
    managers,
    usedMaxChip,
    submitted: !!captainRecord,
  };
}

module.exports = {
  getClubScoreForEvent,
  getManagerBreakdown,
  getClubScoreWithCaptain,
  buildLiveContext,
};
