// Turns the raw /fixtures/?event=X response into two lookups keyed by
// real EPL club ID:
//   opponentOf[clubId]      -> the club they play this gameweek (or null if blank GW)
//   fixtureStatusOf[clubId] -> "not_started" | "live" | "provisional" | "finished"
//
// FPL has two distinct "finished" signals: finished_provisional (true
// almost immediately after full-time, before bonus points are confirmed
// — scores can still shift) and finished (true only once everything,
// including bonus, is officially locked in). Collapsing these into one
// "finished" state was the reason scores could visibly move even after a
// match "looked done" — this keeps them separate so the UI can show a
// clear "still settling" indicator.

function buildFixtureLookups(fixtures) {
  const opponentOf = {};
  const fixtureStatusOf = {};

  for (const f of fixtures) {
    let status;
    if (f.finished) {
      status = "finished";
    } else if (f.finished_provisional) {
      status = "provisional";
    } else if (f.started) {
      status = "live";
    } else {
      status = "not_started";
    }

    opponentOf[f.team_h] = f.team_a;
    opponentOf[f.team_a] = f.team_h;
    fixtureStatusOf[f.team_h] = status;
    fixtureStatusOf[f.team_a] = status;
  }

  return { opponentOf, fixtureStatusOf };
}

module.exports = { buildFixtureLookups };
