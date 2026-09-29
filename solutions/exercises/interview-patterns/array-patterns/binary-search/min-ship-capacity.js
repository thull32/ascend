function min_capacity(weights, days) {
  function feasible(cap) {
    let needed = 1;
    let load = 0;
    for (const w of weights) {
      if (load + w > cap) {
        needed += 1;
        load = 0;
      }
      load += w;
    }
    return needed <= days;
  }

  let lo = Math.max(...weights), hi = weights.reduce((a, b) => a + b, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (feasible(mid)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}
