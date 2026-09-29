function longest_subarray_at_most(nums, limit) {
  let left = 0;
  let total = 0;
  let best = 0;
  for (let right = 0; right < nums.length; right++) {
    total += nums[right];
    while (total > limit) {
      total -= nums[left];
      left += 1;
    }
    best = Math.max(best, right - left + 1);
  }
  return best;
}
