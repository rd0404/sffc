// Season is split into two phases. The table and results are scoped to
// whichever phase is requested — Phase 2 does NOT carry over Phase 1's
// standings, per the rulebook's phase-change rules.

const PHASES = {
  1: { start: 1, end: 19 },
  2: { start: 20, end: 38 },
};

function getPhaseForEvent(event) {
  return event <= 19 ? 1 : 2;
}

function getPhaseRange(phase) {
  const p = PHASES[phase] || PHASES[1];
  return [p.start, p.end];
}

module.exports = { getPhaseForEvent, getPhaseRange };
