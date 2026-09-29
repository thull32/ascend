function breaker(events, window, min_calls, threshold_pct, open_ms, trials) {
  const calls = [];
  let state = "closed";
  let win = [];
  let opened_at = null;
  let half_open_trials = [];

  function pushWin(v) {
    win.push(v);
    if (win.length > window) win.shift();
  }

  for (const [t, outcome] of events) {
    const isFail = outcome === "fail" || outcome === "slow";

    if (state === "closed") {
      calls.push("pass");
      pushWin(isFail);
      const size = win.length;
      const failures = win.filter(Boolean).length;
      if (size >= min_calls && failures * 100 >= threshold_pct * size) {
        state = "open";
        opened_at = t;
        win = [];
      }
    } else if (state === "open") {
      if (t - opened_at >= open_ms) {
        state = "half_open";
        half_open_trials = [];
        calls.push("trial");
        half_open_trials.push(isFail);
        if (half_open_trials.length >= trials) {
          const failures = half_open_trials.filter(Boolean).length;
          if (failures * 100 >= threshold_pct * trials) {
            state = "open";
            opened_at = t;
          } else {
            state = "closed";
            win = [];
          }
        }
      } else {
        calls.push("reject");
      }
    } else {
      // half_open
      calls.push("trial");
      half_open_trials.push(isFail);
      if (half_open_trials.length >= trials) {
        const failures = half_open_trials.filter(Boolean).length;
        if (failures * 100 >= threshold_pct * trials) {
          state = "open";
          opened_at = t;
        } else {
          state = "closed";
          win = [];
        }
      }
    }
  }

  return { calls, state };
}
