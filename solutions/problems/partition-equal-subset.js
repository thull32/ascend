// Partition Equal Subset Sum: 0/1 knapsack over reachable sums, 1-D array updated downwards.
function can_partition(nums) {
  const total = nums.reduce((a, b) => a + b, 0);
  if (total % 2 !== 0) {
    return false;
  }
  const target = total / 2;
  const reach = new Array(target + 1).fill(false);
  reach[0] = true;

  for (const x of nums) {
    for (let s = target; s >= x; s--) {
      if (reach[s - x]) {
        reach[s] = true;
      }
    }
    if (reach[target]) {
      return true;
    }
  }
  return reach[target];
}
