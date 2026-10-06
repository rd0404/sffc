// Netlify Function — GET /.netlify/functions/next-deadline
//
// Returns the next upcoming FPL gameweek deadline (the soonest
// deadline_time that is still in the future), straight from FPL's own
// bootstrap data. The site uses this for the countdown in the header.
// Deliberately NOT cached: right after a deadline passes, the page asks
// again and must get the following gameweek's deadline, not a stale one.

const fplClient = require("../../lib/fplClient");

exports.handler = async () => {
  try {
    const bootstrap = await fplClient.getBootstrap();
    const now = Date.now();

    const upcoming = bootstrap.events
      .filter((e) => e.deadline_time && new Date(e.deadline_time).getTime() > now)
      .sort((a, b) => new Date(a.deadline_time) - new Date(b.deadline_time))[0];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: upcoming ? upcoming.id : null,
        name: upcoming ? upcoming.name : null,
        deadlineTime: upcoming ? upcoming.deadline_time : null,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
