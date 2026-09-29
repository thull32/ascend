// Two pointers from the ends of a sorted array: move the low pointer up if
// the sum is too small, the high pointer down if too large.
function two_sum_sorted(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const s = nums[lo] + nums[hi];
    if (s === target) return [lo, hi];
    if (s < target) lo += 1;
    else hi -= 1;
  }
  return []; // unreachable given the guarantee
}
