// Reduce to subset-sum: with all pluses summing to `total`, flipping some
// subset S to minus changes the total by -2*sum(S), so sum(S) = (total -
// target) / 2 is the goal; count subsets hitting that goal with 0/1 DP.
function target_sum_ways(nums, target) {
  const total = nums.reduce((a, b) => a + b, 0);
  if (Math.abs(target) > total || (total + target) % 2 !== 0) return 0;
  const goal = (total + target) / 2;
  const cnt = new Array(goal + 1).fill(0);
  cnt[0] = 1;
  for (const x of nums) {
    for (let s = goal; s >= x; s--) {
      // downwards: each number used once
      cnt[s] += cnt[s - x];
    }
  }
  return cnt[goal];
}
