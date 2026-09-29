function semaphore_trace(permits, ops, bounded) {
  let count = permits;
  const waiters = [];
  const granted = [];

  for (let i = 0; i < ops.length; i++) {
    const [thread, action] = ops[i];
    if (action === "acquire") {
      if (count > 0) {
        count -= 1;
        granted.push(thread);
      } else {
        waiters.push(thread);
      }
    } else {
      if (bounded && count >= permits) {
        return { granted, count, error_at: i };
      }
      if (waiters.length > 0) {
        granted.push(waiters.shift());
      } else {
        count += 1;
      }
    }
  }

  return { granted, count, error_at: -1 };
}
