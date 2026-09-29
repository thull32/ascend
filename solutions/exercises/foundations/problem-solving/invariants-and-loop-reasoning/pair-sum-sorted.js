function pair_sum_sorted(nums, target) {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo < hi) {
    const s = nums[lo] + nums[hi];
    if (s === target) {
      return [lo, hi];
    }
    if (s < target) {
      lo += 1;
    } else {
      hi -= 1;
    }
  }
  return [-1, -1];
}
