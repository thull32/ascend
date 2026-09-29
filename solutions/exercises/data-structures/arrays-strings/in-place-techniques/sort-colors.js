function sort_colors(nums) {
  let lo = 0, mid = 0, hi = nums.length - 1;
  while (mid <= hi) {
    if (nums[mid] === 0) {
      const tmp = nums[lo];
      nums[lo] = nums[mid];
      nums[mid] = tmp;
      lo += 1;
      mid += 1;
    } else if (nums[mid] === 1) {
      mid += 1;
    } else {
      const tmp = nums[mid];
      nums[mid] = nums[hi];
      nums[hi] = tmp;
      hi -= 1;
    }
  }
  return nums;
}
