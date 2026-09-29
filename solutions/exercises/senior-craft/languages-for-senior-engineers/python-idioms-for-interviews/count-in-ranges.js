function count_in_ranges(nums, queries) {
  const s = nums.slice().sort((a, b) => a - b);

  function lowerBound(x) {
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function upperBound(x) {
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  return queries.map(([lo, hi]) => (lo > hi ? 0 : upperBound(hi) - lowerBound(lo)));
}
