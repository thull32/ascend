function sqs_lifecycle(visibility, max_receives, polls) {
  const received = [];
  let side_effects = 0;
  let final = "pending";

  let state = "visible";
  let invisible_until = 0;
  let latest_receipt = -1;
  let receive_count = 0;

  // events: {t, rank, i, kind}; rank 0 = complete (before polls at equal t), 1 = poll
  const events = polls.map((p, i) => ({ t: p[0], rank: 1, i, kind: "poll" }));

  function popMin() {
    let bestIdx = -1;
    for (let k = 0; k < events.length; k++) {
      const e = events[k];
      if (bestIdx === -1) {
        bestIdx = k;
        continue;
      }
      const b = events[bestIdx];
      if (e.t < b.t || (e.t === b.t && e.rank < b.rank) ||
          (e.t === b.t && e.rank === b.rank && e.i < b.i)) {
        bestIdx = k;
      }
    }
    const [ev] = events.splice(bestIdx, 1);
    return ev;
  }

  while (events.length > 0) {
    const { t, i, kind } = popMin();
    if (kind === "complete") {
      const outcome = polls[i][2];
      if (outcome === "ok" || outcome === "crash_after_effect") {
        side_effects += 1;
      }
      if (outcome === "ok") {
        if (latest_receipt === i && state !== "dlq" && state !== "deleted") {
          state = "deleted";
          final = "deleted";
        }
      }
    } else {
      if (state === "invisible" && t >= invisible_until) {
        state = "visible";
      }
      if (state !== "visible") {
        continue;
      }
      if (receive_count >= max_receives) {
        state = "dlq";
        final = "dlq";
        continue;
      }
      receive_count += 1;
      latest_receipt = i;
      const duration = polls[i][1];
      invisible_until = t + visibility;
      state = "invisible";
      received.push(i);
      events.push({ t: t + duration, rank: 0, i, kind: "complete" });
    }
  }

  return { received, side_effects, final };
}
