function split_array(nums, k) {
  function piecesNeeded(cap) {
    let pieces = 1;
    let running = 0;
    for (const x of nums) {
      if (running + x > cap) {
        pieces++;
        running = x;
      } else {
        running += x;
      }
    }
    return pieces;
  }

  let lo = Math.max(...nums), hi = nums.reduce((a, b) => a + b, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (piecesNeeded(mid) <= k) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}
