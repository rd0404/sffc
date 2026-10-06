// Netlify Function — GET /.netlify/functions/live-status
//
// Is any Premier League match live (or finished but not yet fully
// confirmed by FPL) right now? The site's auto-refresh uses this: it only
// re-fetches data every minute while this says live, so nothing hammers
// the FPL API on quiet days.
//
// "Live" = a fixture has kicked off but FPL hasn't marked it finished,
// with kickoff in the last 6 hours (the cap stops one stuck/odd fixture
// from keeping auto-refresh on forever). Not cached, on purpose.

exports.handler = async () => {
  try {
    const res = await fetch("https://fantasy.premierleague.com/api/fixtures/", {
      headers: { "User-Agent": "Mozilla/5.0 (SFFC-FPL-Dashboard)" },
    });
    if (!res.ok) throw new Error(`FPL fixtures ${res.status}`);
    const fixtures = await res.json();

    const now = Date.now();
    const sixHours = 6 * 60 * 60 * 1000;
    const liveFixtures = fixtures.filter((f) => {
      if (!f.started || f.finished || !f.kickoff_time) return false;
      return now - new Date(f.kickoff_time).getTime() < sixHours;
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ live: liveFixtures.length > 0, liveCount: liveFixtures.length }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
