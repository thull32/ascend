function triangle_count(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  let count = 0;
  for (let k = n - 1; k >= 2; k--) {
    let lo = 0, hi = k - 1;
    while (lo < hi) {
      if (sorted[lo] + sorted[hi] > sorted[k]) {
        count += hi - lo;
        hi--;
      } else {
        lo++;
      }
    }
  }
  return count;
}
