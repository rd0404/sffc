// Builds a season table from any number of "results" arrays (each an
// array of { home, homeScore, homePts, away, awayScore, awayPts }).
// Used by both /api/standings (finalized snapshots only) and
// /api/standings-live (finalized snapshots + current live gameweek).

function buildTable(teamsConfig, resultsArrays) {
  const table = {};
  for (const team of teamsConfig) {
    table[team.club] = {
      club: team.club,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      points: 0,
      scoreFor: 0,
      scoreAgainst: 0,
    };
  }

  for (const results of resultsArrays) {
    for (const r of results) {
      const home = table[r.home];
      const away = table[r.away];
      if (!home || !away) continue;

      home.played += 1;
      away.played += 1;
      home.scoreFor += r.homeScore;
      home.scoreAgainst += r.awayScore;
      away.scoreFor += r.awayScore;
      away.scoreAgainst += r.homeScore;
      home.points += r.homePts;
      away.points += r.awayPts;

      if (r.homePts === 3) {
        home.won += 1;
        away.lost += 1;
      } else if (r.awayPts === 3) {
        away.won += 1;
        home.lost += 1;
      } else {
        home.drawn += 1;
        away.drawn += 1;
      }
    }
  }

  return Object.values(table).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.scoreFor - a.scoreAgainst;
    const gdB = b.scoreFor - b.scoreAgainst;
    if (gdB !== gdA) return gdB - gdA;
    return b.scoreFor - a.scoreFor;
  });
}

module.exports = { buildTable };
