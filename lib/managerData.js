// Shared by /api/gameweek, /api/team-of-week, and /api/compare — all need
// "this club's (or manager's) score for gameweek N", whether N is the
// live current gameweek or a finished past one.

const fplClient = require("./fplClient");

// Live event_total (current GW) is real-time; for a past GW we read each
// manager's exact points from their own history instead.
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

// Per-manager breakdown for one club: each manager's points for the
// requested gameweek plus their own FPL season-total points.
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

module.exports = { getClubScoreForEvent, getManagerBreakdown };
