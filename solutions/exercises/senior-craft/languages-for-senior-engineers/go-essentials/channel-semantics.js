function simulate_channel(capacity, ops) {
  const buffer = [];
  let closed = false;
  const outcomes = [];

  for (const op of ops) {
    const kind = op[0];

    if (kind === "send") {
      const v = op[1];
      if (closed) {
        outcomes.push("panic: send on closed channel");
        break;
      }
      if (capacity === null || buffer.length >= capacity) {
        outcomes.push("deadlock");
        break;
      }
      buffer.push(v);
      outcomes.push("ok");
    } else if (kind === "recv") {
      if (buffer.length > 0) {
        outcomes.push([buffer.shift(), true]);
      } else if (closed) {
        outcomes.push([0, false]);
      } else {
        outcomes.push("deadlock");
        break;
      }
    } else if (kind === "close") {
      if (capacity === null) {
        outcomes.push("panic: close of nil channel");
        break;
      }
      if (closed) {
        outcomes.push("panic: close of closed channel");
        break;
      }
      closed = true;
      outcomes.push("ok");
    }
  }

  return outcomes;
}
