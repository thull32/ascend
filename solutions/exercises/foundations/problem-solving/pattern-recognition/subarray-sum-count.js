function subarray_sum(nums, k) {
  const counts = new Map([[0, 1]]);
  let prefix = 0;
  let total = 0;
  for (const x of nums) {
    prefix += x;
    total += counts.get(prefix - k) || 0;
    counts.set(prefix, (counts.get(prefix) || 0) + 1);
  }
  return total;
}
