// Shared by /api/gameweek, /api/team-of-week, /api/compare, /api/standings-live,
// and the season snapshot job.

const fplClient = require("./fplClient");
const { getCaptainRecord } = require("./captainStore");

async function getClubScoreForEvent(team, event, currentEvent, getStandings) {
  const data = await getStandings(team);
  if (event === currentEvent) {
    return data.standings.results.reduce((sum, m) => sum + m.event_total, 0);
  }
  const entryIds = data.standings.results.map((m) => m.entry);
  let score = 0;
  for (const entryId of entryIds) {
    const history = await fplClient.getEntryHistory(entryId);
    const row = history.current.find((h) => h.event === event);
    score += row ? row.points : 0;
  }
  return score;
}

async function getManagerBreakdown(team, event, currentEvent, standingsData) {
  const managers = [];
  for (const m of standingsData.standings.results) {
    let gwPoints;
    let totalPoints;
    if (event === currentEvent) {
      gwPoints = m.event_total;
      totalPoints = m.total;
    } else {
      const history = await fplClient.getEntryHistory(m.entry);
      const row = history.current.find((h) => h.event === event);
      gwPoints = row ? row.points : 0;
      totalPoints = row ? row.total_points : m.total;
    }
    managers.push({
      entry: m.entry,
      teamName: m.entry_name,
      managerName: m.player_name,
      club: team.club,
      gwPoints,
      totalPoints,
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
