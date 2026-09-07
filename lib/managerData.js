// Shared by /api/gameweek, /api/team-of-week, /api/compare, /api/standings-live,
// and the season snapshot job — all need "this club's (or manager's) score
// for gameweek N", whether N is the live current gameweek or a finished
// past one, and (except Team of the Week) with the SFFC captain doubling
// rule applied.
//
// IMPORTANT: for both the live current gameweek and past gameweeks, we
// read each manager's RAW points and subtract event_transfers_cost
// ourselves, rather than trusting a pre-summed field to already be net of
// transfer-hit penalties. This was a real bug once (confirmed against
// known -4 hits that weren't being reflected) — event_total from league
// standings and the "points" field from entry history are NOT reliably
// net of hits, so we always compute net = raw points - transfer cost
// explicitly, from the same entry_history object the FPL app itself uses
// for a manager's own "Points" page.

const fplClient = require("./fplClient");
const { getCaptainRecord } = require("./captainStore");

// Net (hit-adjusted) points for one manager in one gameweek, whether it's
// the live current gameweek or a finished past one. Always computed
// explicitly as raw points minus transfer cost — never trusts a field to
// already be net.
async function getManagerNetPoints(entryId, event, currentEvent) {
  if (event === currentEvent) {
    const picks = await fplClient.getEntryPicks(entryId, event);
    const eh = picks.entry_history;
    return {
      gwPoints: eh.points - eh.event_transfers_cost,
      totalPoints: eh.total_points,
    };
  }
  const history = await fplClient.getEntryHistory(entryId);
  const row = history.current.find((h) => h.event === event);
  if (!row) return { gwPoints: 0, totalPoints: null };
  return {
    gwPoints: row.points - row.event_transfers_cost,
    totalPoints: row.total_points,
  };
}

async function getClubScoreForEvent(team, event, currentEvent, getStandings) {
  const data = await getStandings(team);
  let score = 0;
  for (const m of data.standings.results) {
    const { gwPoints } = await getManagerNetPoints(m.entry, event, currentEvent);
    score += gwPoints;
  }
  return score;
}

// Per-manager breakdown for one club: each manager's net points for the
// requested gameweek plus their own FPL season-total points.
async function getManagerBreakdown(team, event, currentEvent, standingsData) {
  const managers = [];
  for (const m of standingsData.standings.results) {
    const { gwPoints, totalPoints } = await getManagerNetPoints(m.entry, event, currentEvent);
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
async function getClubScoreWithCaptain(team, event, currentEvent, getStandings) {
  const standingsData = await getStandings(team);
  const managers = await getManagerBreakdown(team, event, currentEvent, standingsData);
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

module.exports = { getClubScoreForEvent, getManagerBreakdown, getClubScoreWithCaptain };
