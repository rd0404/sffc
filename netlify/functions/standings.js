// Netlify Function — GET /.netlify/functions/standings
//
// Reads every finished-gameweek snapshot and rolls them up into a season
// table: 3pts win / 1pt draw / 0pts loss, ranked by points then total
// score (goal-difference-style tiebreaker). Doesn't hit the live FPL API
// at all — pure aggregation, safe to call as often as you like.

const teamsConfig = require("../../lib/teamsConfig");
const { resultsStore } = require("../../lib/blobStore");

exports.handler = async () => {
  try {
    const store = resultsStore();

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
      };
    }

    const { blobs } = await store.list({ prefix: "gw-" });

    for (const blobMeta of blobs) {
      let data = null;
      try {
        data = await store.get(blobMeta.key, { type: "json" });
      } catch (_) {
        continue;
      }
      if (!data || !data.results) continue;

      for (const r of data.results) {
        const home = table[r.home];
        const away = table[r.away];
        if (!home || !away) continue;

        home.played += 1;
        away.played += 1;
        home.scoreFor += r.homeScore;
        away.scoreFor += r.awayScore;
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

    const standings = Object.values(table).sort(
      (a, b) => b.points - a.points || b.scoreFor - a.scoreFor
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standings }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
