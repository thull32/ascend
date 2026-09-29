function rate_limit(requests, limit, window_ms) {
  const logs = new Map();
  const result = [];

  for (const [user, nowMs] of requests) {
    if (!logs.has(user)) logs.set(user, []);
    const log = logs.get(user);
    const cutoff = nowMs - window_ms;
    while (log.length && log[0] <= cutoff) log.shift();

    if (log.length < limit) {
      log.push(nowMs);
      result.push(true);
    } else {
      result.push(false);
    }
  }

  return result;
}
