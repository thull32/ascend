function longest_within_limit(nums, limit) {
  const maxDq = [];
  const minDq = [];
  let left = 0;
  let best = 0;
  for (let right = 0; right < nums.length; right++) {
    const x = nums[right];
    while (maxDq.length && nums[maxDq[maxDq.length - 1]] <= x) maxDq.pop();
    maxDq.push(right);
    while (minDq.length && nums[minDq[minDq.length - 1]] >= x) minDq.pop();
    minDq.push(right);

    while (nums[maxDq[0]] - nums[minDq[0]] > limit) {
      if (maxDq[0] === left) maxDq.shift();
      if (minDq[0] === left) minDq.shift();
      left++;
    }

    best = Math.max(best, right - left + 1);
  }
  return best;
}
