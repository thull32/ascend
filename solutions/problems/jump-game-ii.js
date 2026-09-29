// BFS by levels over reachable ranges: a jump ends the current window and
// starts a new one reaching to the furthest index found so far.
function min_jumps(nums) {
  let jumps = 0;
  let windowEnd = 0;
  let furthest = 0;
  // Never process the last index: arriving there needs no further jump.
  for (let i = 0; i < nums.length - 1; i++) {
    furthest = Math.max(furthest, i + nums[i]);
    if (i === windowEnd) {
      jumps += 1;
      windowEnd = furthest;
      if (windowEnd >= nums.length - 1) break;
    }
  }
  return jumps;
}
