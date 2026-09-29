function futex_calls(events) {
  let state = 0;
  const waiters = [];
  let wait = 0, wake = 0;

  for (const [op, thread] of events) {
    if (op === "lock") {
      if (state === 0) {
        state = 1;
      } else {
        state = 2;
        waiters.push(thread);
        wait += 1;
      }
    } else {
      const oldState = state;
      state = 0;
      if (oldState === 2) {
        wake += 1;
        if (waiters.length > 0) {
          waiters.shift();
          state = 2;
        }
      }
    }
  }

  return { wait, wake };
}
