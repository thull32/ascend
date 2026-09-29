// Longest Increasing Subsequence — O(n log n) via smallest-tail array and binary search.
function length_of_lis(nums) {
  const tails = [];
  for (const x of nums) {
    // first index where tails[idx] >= x (bisect_left)
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    if (lo === tails.length) tails.push(x);
    else tails[lo] = x;
  }
  return tails.length;
}
