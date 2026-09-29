function breaker(events, volume, error_pct, window, sleep) {
  const out = [];
  let state = "closed";
  let openedAt = null;
  let history = []; // [t, failed]

  for (const [t, outcome] of events) {
    const failed = outcome === "error" || outcome === "timeout";

    if (state === "closed") {
      history.push([t, failed]);
      history = history.filter(([ht]) => ht > t - window);
      const count = history.length;
      const failures = history.filter(([, hf]) => hf).length;
      if (count >= volume && failures * 100 >= error_pct * count) {
        state = "open";
        openedAt = t;
      }
      out.push("call");
    } else {
      if (t - openedAt < sleep) {
        out.push("reject");
      } else {
        out.push("trial");
        if (failed) {
          openedAt = t;
        } else {
          state = "closed";
          history = [];
        }
      }
    }
  }

  return out;
}
