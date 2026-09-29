function backoff_schedule(base_ms, cap_ms, draws) {
  const sleeps = [];
  for (let i = 0; i < draws.length; i++) {
    const window = Math.min(cap_ms, base_ms * 2 ** i);
    sleeps.push(Math.floor(draws[i] * window));
  }
  return sleeps;
}
