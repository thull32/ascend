function lower_bound(nums, target) {
  let lo = 0, hi = nums.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (nums[mid] >= target) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}
