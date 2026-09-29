// Binary search the eating speed: hours needed is monotonically non-increasing
// as speed grows, so find the smallest speed that finishes within h hours.
function min_eating_speed(piles, h) {
  function hoursAt(k) {
    let total = 0;
    for (const p of piles) total += Math.ceil(p / k);
    return total;
  }

  let lo = 1, hi = Math.max(...piles);
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (hoursAt(mid) <= h) {
      hi = mid; // mid works; the answer is mid or slower
    } else {
      lo = mid + 1; // mid is too slow
    }
  }
  return lo;
}
