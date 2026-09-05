// Shared by the finalized snapshot job and the live-provisional endpoint,
// so both compute match results the exact same way.

function computeMatchResults(teamsConfig, clubScoreByFplId, opponentOf) {
  const seen = new Set();
  const results = [];

  for (const team of teamsConfig) {
    const homeId = team.fplClubId;
    if (seen.has(homeId)) continue;

    const awayId = opponentOf[homeId];
    if (awayId == null) continue; // blank gameweek for this club

    seen.add(homeId);
    seen.add(awayId);

    const homeTeam = teamsConfig.find((t) => t.fplClubId === homeId);
    const awayTeam = teamsConfig.find((t) => t.fplClubId === awayId);
    const homeScore = clubScoreByFplId[homeId] || 0;
    const awayScore = clubScoreByFplId[awayId] || 0;

    let homePts;
    let awayPts;
    if (homeScore > awayScore) {
      homePts = 3;
      awayPts = 0;
    } else if (homeScore < awayScore) {
      homePts = 0;
      awayPts = 3;
    } else {
      homePts = 1;
      awayPts = 1;
    }

    results.push({
      home: homeTeam.club,
      homeScore,
      homePts,
      away: awayTeam.club,
      awayScore,
      awayPts,
    });
  }

  return results;
}

module.exports = { computeMatchResults };
