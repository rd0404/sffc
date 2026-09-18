// When someone asks for squad/picks data for a gameweek whose deadline
// hasn't passed yet, there's no real locked-in squad for it — FPL just
// carries forward whatever the manager last saved. Rather than fetch
// possibly-incomplete data for that future gameweek, we fall back to the
// most recent gameweek whose deadline HAS passed, so we show a real,
// stable squad instead. Once the requested gameweek's own deadline
// passes, this returns that gameweek itself — no more fallback needed.

function getEffectivePickEvent(bootstrap, requestedEvent) {
  const requestedEv = bootstrap.events.find((e) => e.id === requestedEvent);
  const requestedDeadlinePassed =
    requestedEv && new Date(requestedEv.deadline_time).getTime() < Date.now();

  if (requestedDeadlinePassed) {
    return { pickEvent: requestedEvent, isFallback: false };
  }

  let latestPassed = null;
  for (const ev of bootstrap.events) {
    if (ev.id > requestedEvent) continue;
    if (new Date(ev.deadline_time).getTime() < Date.now()) {
      if (latestPassed === null || ev.id > latestPassed) latestPassed = ev.id;
    }
  }

  if (latestPassed === null || latestPassed === requestedEvent) {
    return { pickEvent: requestedEvent, isFallback: false };
  }
  return { pickEvent: latestPassed, isFallback: true };
}

module.exports = { getEffectivePickEvent };
