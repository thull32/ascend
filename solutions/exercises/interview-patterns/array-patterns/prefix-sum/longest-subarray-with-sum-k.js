function longest_subarray_sum_k(nums, k) {
  const firstIndex = new Map([[0, 0]]);
  let prefix = 0;
  let best = 0;
  for (let j = 0; j < nums.length; j++) {
    prefix += nums[j];
    if (firstIndex.has(prefix - k)) {
      best = Math.max(best, (j + 1) - firstIndex.get(prefix - k));
    }
    if (!firstIndex.has(prefix)) {
      firstIndex.set(prefix, j + 1);
    }
  }
  return best;
}
