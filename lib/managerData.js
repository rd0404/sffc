// Shared by /api/gameweek, /api/team-of-week, /api/compare, /api/standings-live,
// and the season snapshot job.
//
// IMPORTANT — how live scoring actually works here:
// For the CURRENT gameweek, we do NOT trust entry_history.points (from
// the picks endpoint) to be truly live — in practice it only seems to
// update after each day's matches finish, not minute-by-minute. Instead
// we compute each manager's live score ourselves: pull the real,
// continuously-updating per-player points from event/{id}/live/, then
// sum (player's live points x their pick multiplier) across the
// manager's starting XI, and subtract their transfer-cost hit. This
// mirrors exactly what FPL's own live rankings do internally.
//
// For a FINISHED past gameweek, entry_history.points is reliable (it's
// long since settled), so we still use that simpler path there.
//
// callers that want true live data for the current gameweek must fetch
// it ONCE per request via getLiveElementsMap(event) and pass it through
// as `liveElementsMap` — this avoids re-fetching the same ~700-player
// payload once per manager (120+ times) on every request.

const fplClient = require("./fplClient");
const { getCaptainRecord } = require("./captainStore");

// Fetch once per request, pass down through the call chain below.
async function getLiveElementsMap(event) {
  const liveData = await fplClient.getEventLive(event);
  const map = {};
  liveData.elements.forEach((el) => {
    map[el.id] = el.stats.total_points;
  });
  return map;
}

// Net (hit-adjusted) points for one manager in one gameweek.
async function getManagerNetPoints(entryId, event, currentEvent, liveElementsMap) {
  if (event === currentEvent && liveElementsMap) {
    const picks = await fplClient.getEntryPicks(entryId, event);
    let rawPoints = 0;
    for (const p of picks.picks) {
      if (p.position > 11) continue; // starting XI only (auto-subs not modeled)
      const livePts = liveElementsMap[p.element] || 0;
      rawPoints += livePts * p.multiplier;
    }
    const cost = picks.entry_history ? picks.entry_history.event_transfers_cost : 0;
    const totalPoints = picks.entry_history ? picks.entry_history.total_points : null;
    return { gwPoints: rawPoints - cost, totalPoints };
  }

  if (event === currentEvent) {
    // No live map supplied (caller didn't fetch it) — fall back to the
    // older, less-live picks field rather than fail outright.
    const picks = await fplClient.getEntryPicks(entryId, event);
    const eh = picks.entry_history;
    return { gwPoints: eh.points - eh.event_transfers_cost, totalPoints: eh.total_points };
  }

  const history = await fplClient.getEntryHistory(entryId);
  const row = history.current.find((h) => h.event === event);
  if (!row) return { gwPoints: 0, totalPoints: null };
  return { gwPoints: row.points - row.event_transfers_cost, totalPoints: row.total_points };
}

async function getClubScoreForEvent(team, event, currentEvent, getStandings, liveElementsMap) {
  const data = await getStandings(team);
  let score = 0;
  for (const m of data.standings.results) {
    const { gwPoints } = await getManagerNetPoints(m.entry, event, currentEvent, liveElementsMap);
    score += gwPoints;
  }
  return score;
}

// Per-manager breakdown for one club: each manager's net points for the
// requested gameweek plus their own FPL season-total points.
async function getManagerBreakdown(team, event, currentEvent, standingsData, liveElementsMap) {
  const managers = [];
  for (const m of standingsData.standings.results) {
    const { gwPoints, totalPoints } = await getManagerNetPoints(m.entry, event, currentEvent, liveElementsMap);
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

// total = sum of all 6 managers' points + one extra copy of the captain's
// points (equivalent to doubling just the captain).
async function getClubScoreWithCaptain(team, event, currentEvent, getStandings, liveElementsMap) {
  const standingsData = await getStandings(team);
  const managers = await getManagerBreakdown(team, event, currentEvent, standingsData, liveElementsMap);
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
  getLiveElementsMap,
};
