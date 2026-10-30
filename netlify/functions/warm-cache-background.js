// Netlify Scheduled Background Function — keeps the "last good copy" cache
// (see lib/staleCache.js) filled while FPL is healthy, so the site still has
// something to show when FPL errors right after a deadline.
const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const gameweek = require("./gameweek");

exports.handler = async () => {
  const results = { ok: [], failed: [] };
  try {
    const bootstrap = await fplClient.getBootstrap();
    const current = fplClient.getCurrentEvent(bootstrap);

    for (const ev of [current, current + 1]) {
      if (ev >= 1 && ev <= 38) {
        try { await fplClient.getFixtures(ev); results.ok.push("fixtures " + ev); }
        catch (e) { results.failed.push("fixtures " + ev); }
      }
    }
    for (const t of teamsConfig) {
      try { await fplClient.getLeagueStandings(t.leagueId); results.ok.push(t.club); }
      catch (e) { results.failed.push(t.club); }
    }
    // Warms the cached Results payload for the current gameweek.
    await gameweek.handler({ queryStringParameters: {} });
  } catch (e) {
    results.failed.push("bootstrap: " + e.message);
  }
  console.log("warm-cache", JSON.stringify(results));
};

// Lets this function use Netlify's automatic storage credentials.
exports.handler = require("../../lib/blobStore").wrapHandler(exports.handler);
