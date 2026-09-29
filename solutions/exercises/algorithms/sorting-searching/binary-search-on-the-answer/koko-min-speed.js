function min_eating_speed(piles, h) {
  function feasible(s) {
    let hours = 0;
    for (const p of piles) hours += Math.floor((p + s - 1) / s);
    return hours <= h;
  }

  let lo = 1, hi = Math.max(...piles);
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
