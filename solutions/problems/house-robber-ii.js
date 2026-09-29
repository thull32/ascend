// Circular arrangement: the first and last house can't both be robbed, so
// take the best of the linear problem on [0, n-2] and [1, n-1].
function rob_circular(nums) {
  const n = nums.length;
  if (n === 1) return nums[0];

  function robPath(lo, hi) {
    let twoBack = 0, oneBack = 0;
    for (let i = lo; i <= hi; i++) {
      [twoBack, oneBack] = [oneBack, Math.max(oneBack, twoBack + nums[i])];
    }
    return oneBack;
  }

  return Math.max(robPath(0, n - 2), robPath(1, n - 1));
}
