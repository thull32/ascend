function backoff_schedule(base_ms, cap_ms, deadline_ms, draws) {
  const sleeps = [];
  let total = 0;
  for (let i = 0; i < draws.length; i++) {
    const ceiling = Math.min(cap_ms, base_ms * 2 ** i);
    const sleep = Math.floor((ceiling * draws[i]) / 1000);
    if (total + sleep > deadline_ms) break;
    sleeps.push(sleep);
    total += sleep;
  }
  return sleeps;
}
