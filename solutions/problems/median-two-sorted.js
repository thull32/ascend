// Median of Two Sorted Arrays — binary search a partition over the shorter array.
function find_median_sorted_arrays(nums1, nums2) {
  let a = nums1, b = nums2;
  if (a.length > b.length) {
    [a, b] = [b, a];
  }
  const m = a.length, n = b.length;
  const total = m + n;
  const half = Math.floor((total + 1) / 2);
  const inf = Infinity;

  let lo = 0, hi = m;
  while (lo <= hi) {
    const i = lo + Math.floor((hi - lo) / 2); // elements of a on the left
    const j = half - i; // elements of b on the left
    const aLeft = i > 0 ? a[i - 1] : -inf;
    const aRight = i < m ? a[i] : inf;
    const bLeft = j > 0 ? b[j - 1] : -inf;
    const bRight = j < n ? b[j] : inf;

    if (aLeft <= bRight && bLeft <= aRight) {
      if (total % 2 === 1) {
        return Math.max(aLeft, bLeft);
      }
      return (Math.max(aLeft, bLeft) + Math.min(aRight, bRight)) / 2;
    }
    if (aLeft > bRight) {
      hi = i - 1;
    } else {
      lo = i + 1;
    }
  }
  throw new Error("inputs are not sorted");
}
