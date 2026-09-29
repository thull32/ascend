// Max Consecutive Ones with k Flips — sliding window, at most k zeros inside.
function longest_ones(nums, k) {
  let left = 0;
  let zeros = 0;
  let best = 0;
  for (let right = 0; right < nums.length; right++) {
    if (nums[right] === 0) zeros += 1;
    while (zeros > k) {
      if (nums[left] === 0) zeros -= 1;
      left += 1;
    }
    best = Math.max(best, right - left + 1);
  }
  return best;
}
