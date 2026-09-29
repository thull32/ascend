// Maximum Product Subarray — track running max and min product ending at each index.
function max_product(nums) {
  let hi = nums[0];
  let lo = nums[0];
  let best = nums[0];
  for (let i = 1; i < nums.length; i++) {
    const x = nums[i];
    const candidates = [x, hi * x, lo * x];
    hi = Math.max(...candidates);
    lo = Math.min(...candidates); // both computed from the old pair
    best = Math.max(best, hi);
  }
  return best;
}
