// Netlify Function — /.netlify/functions/captain
//
// GET  ?club=Arsenal&event=3  -> the club's 6 managers + current submission
//                                + whether this gameweek's deadline has passed.
// POST { club, event, managerEntry, passkey } -> submit a manual captain pick.
// POST { club, event, maxChip: true, passkey } -> use the Max Captain chip.
//
// Submissions lock at the SAME deadline as the real FPL gameweek deadline
// (bootstrap-static's deadline_time) — once it passes, no more changes,
// matching how FPL itself locks team changes before kickoff.

const teamsConfig = require("../../lib/teamsConfig");
const fplClient = require("../../lib/fplClient");
const { getCaptainRecord, setCaptainRecord } = require("../../lib/captainStore");
const teamPasskeys = require("../../lib/teamPasskeys");
const { getPhaseRange } = require("../../lib/phase");

async function getDeadlineInfo(gw) {
  const bootstrap = await fplClient.getBootstrap();
  const ev = bootstrap.events.find((e) => e.id === gw);
  if (!ev) return { deadlineTime: null, locked: false };
  const deadlineTime = ev.deadline_time;
  const locked = Date.now() >= new Date(deadlineTime).getTime();
  return { deadlineTime, locked };
}

async function isMaxChipUsedElsewhereInPhase(club, gw) {
  const phase = gw <= 19 ? 1 : 2;
  const [start, end] = getPhaseRange(phase);
  for (let e = start; e <= end; e++) {
    if (e === gw) continue;
    const rec = await getCaptainRecord(club, e);
    if (rec && rec.maxChip) return true;
  }
  return false;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const club = body.club;
      const gw = body.event;

      if (!club || !gw) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "club and event are required" }),
        };
      }

      const team = teamsConfig.find((t) => t.club === club);
      if (!team) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: `Unknown club '${club}'` }),
        };
      }

      const isAdmin = body.adminPasskey === (process.env.ADMIN_PASSKEY || "sffcadmins");

      if (!isAdmin) {
        const { locked, deadlineTime } = await getDeadlineInfo(gw);
        if (locked) {
          return {
            statusCode: 403,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: `GW${gw}'s deadline (${deadlineTime}) has passed — captain submissions are locked for this gameweek`,
            }),
          };
        }

        const expectedPasskey = teamPasskeys[club];
        if (!body.passkey || body.passkey !== expectedPasskey) {
          return {
            statusCode: 401,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Incorrect passkey for this club" }),
          };
        }
      }

      let record;
      if (body.maxChip) {
        const alreadyUsed = await isMaxChipUsedElsewhereInPhase(club, gw);
        if (alreadyUsed) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Max Captain chip has already been used this phase for this club" }),
          };
        }
        record = { maxChip: true, submittedAt: new Date().toISOString() };
      } else {
        if (!body.managerEntry) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "managerEntry is required unless maxChip is set" }),
          };
        }
        const standings = await fplClient.getLeagueStandings(team.leagueId);
        const chosen = standings.standings.results.find((m) => m.entry === body.managerEntry);
        if (!chosen) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "That manager is not one of this club's 6 members" }),
          };
        }
        record = { managerEntry: body.managerEntry, submittedAt: new Date().toISOString() };
      }

      await setCaptainRecord(club, gw, record);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, record }),
      };
    }

    // GET
    const params = event.queryStringParameters || {};
    const club = params.club;
    const gw = params.event ? parseInt(params.event, 10) : null;

    if (!club || !gw) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "club and event query params are required" }),
      };
    }

    const team = teamsConfig.find((t) => t.club === club);
    if (!team) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Unknown club '${club}'` }),
      };
    }

    const standings = await fplClient.getLeagueStandings(team.leagueId);
    const managers = standings.standings.results.map((m) => ({
      entry: m.entry,
      teamName: m.entry_name,
      managerName: m.player_name,
    }));

    const record = await getCaptainRecord(club, gw);
    const { deadlineTime, locked } = await getDeadlineInfo(gw);
    const maxChipUsedElsewhere = await isMaxChipUsedElsewhereInPhase(club, gw);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        club,
        event: gw,
        managers,
        record: record || null,
        deadlineTime,
        locked,
        maxChipAvailable: !maxChipUsedElsewhere,
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
