function max_circular_sum(nums) {
  const total = nums.reduce((a, b) => a + b, 0);

  let maxEnding = 0, maxSoFar = nums[0];
  let minEnding = 0, minSoFar = nums[0];

  for (const x of nums) {
    maxEnding = Math.max(x, maxEnding + x);
    maxSoFar = Math.max(maxSoFar, maxEnding);
    minEnding = Math.min(x, minEnding + x);
    minSoFar = Math.min(minSoFar, minEnding);
  }

  if (maxSoFar < 0) return maxSoFar;

  return Math.max(maxSoFar, total - minSoFar);
}
