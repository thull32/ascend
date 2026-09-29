function min_jumps(nums) {
  const n = nums.length;
  if (n <= 1) return 0;

  let jumps = 0;
  let currentEnd = 0;
  let furthest = 0;

  for (let i = 0; i < n - 1; i++) {
    furthest = Math.max(furthest, i + nums[i]);
    if (i === currentEnd) {
      jumps += 1;
      currentEnd = furthest;
      if (currentEnd >= n - 1) break;
    }
  }

  return jumps;
}
