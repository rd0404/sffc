// Netlify Scheduled Background Function — runs hourly (see netlify.toml).
//
// Checks whether a new gameweek's deadline has passed since the last time
// this ran. If so, compiles every club's captain (or "not submitted") for
// that gameweek and emails the list to ADMIN_EMAIL. Never sends the same
// gameweek's summary twice, and only ever moves forward one gameweek at a
// time.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { getCaptainRecord } = require("../../lib/captainStore");
const { getLastSummarizedEvent, setLastSummarizedEvent } = require("../../lib/deadlineSummaryStore");
const { sendEmail } = require("../../lib/emailClient");

exports.handler = async () => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn("ADMIN_EMAIL not set — skipping deadline summary check.");
    return;
  }

  const bootstrap = await fplClient.getBootstrap();
  const now = Date.now();

  let latestPastDeadlineEvent = 0;
  for (const ev of bootstrap.events) {
    if (new Date(ev.deadline_time).getTime() < now) {
      latestPastDeadlineEvent = Math.max(latestPastDeadlineEvent, ev.id);
    }
  }

  const lastSummarized = await getLastSummarizedEvent();
  if (latestPastDeadlineEvent <= lastSummarized) {
    return;
  }

  const targetEvent = lastSummarized + 1;

  const rows = await Promise.all(
    teamsConfig.map(async (team) => {
      const record = await getCaptainRecord(team.club, targetEvent);
      let captainLabel = "Not submitted (lowest scorer auto-captained)";
      if (record && record.maxChip) {
        captainLabel = "Max Captain chip used";
      } else if (record && record.managerEntry) {
        try {
          const standings = await fplClient.getLeagueStandings(team.leagueId);
          const m = standings.standings.results.find((x) => x.entry === record.managerEntry);
          captainLabel = m ? `${m.player_name} (${m.entry_name})` : "Unknown manager";
        } catch (_) {
          captainLabel = "Unknown manager";
        }
      }
      return { club: team.club, captainLabel };
    })
  );

  const tableRows = rows
    .map((r) => `<tr><td style="padding:4px 12px;">${r.club}</td><td style="padding:4px 12px;">${r.captainLabel}</td></tr>`)
    .join("");

  const html = `
    <p>Deadline for GW${targetEvent} has passed. Here's every club's captain:</p>
    <table style="border-collapse:collapse;">${tableRows}</table>
  `;

  try {
    await sendEmail({
      to: adminEmail,
      subject: `SFFC Captain List \u2014 GW${targetEvent} Deadline Passed`,
      html,
    });
    await setLastSummarizedEvent(targetEvent);
  } catch (err) {
    console.error("Deadline summary email failed:", err.message);
  }
};
