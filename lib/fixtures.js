// Turns the raw /fixtures/?event=X response into two lookups keyed by
// real EPL club ID:
//   opponentOf[clubId]      -> the club they play this gameweek (or null if blank GW)
//   fixtureStatusOf[clubId] -> "not_started" | "live" | "finished"

function buildFixtureLookups(fixtures) {
  const opponentOf = {};
  const fixtureStatusOf = {};

  for (const f of fixtures) {
    const status = f.finished || f.finished_provisional
      ? "finished"
      : f.started
      ? "live"
      : "not_started";

    opponentOf[f.team_h] = f.team_a;
    opponentOf[f.team_a] = f.team_h;
    fixtureStatusOf[f.team_h] = status;
    fixtureStatusOf[f.team_a] = status;
  }

  return { opponentOf, fixtureStatusOf };
}

module.exports = { buildFixtureLookups };
