// Binary search: the minimum is the only place where nums[mid] <= nums[hi]
// while still being able to shrink toward it.
function find_min(nums) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (nums[mid] > nums[hi]) {
      lo = mid + 1; // minimum is right of mid
    } else {
      hi = mid; // mid could be the minimum
    }
  }
  return nums[lo];
}
