// Maximum Subarray — Kadane's algorithm: extend or restart.
function max_subarray(nums) {
  let bestHere = nums[0];
  let best = nums[0];
  for (let i = 1; i < nums.length; i++) {
    const x = nums[i];
    bestHere = Math.max(x, bestHere + x);
    best = Math.max(best, bestHere);
  }
  return best;
}
