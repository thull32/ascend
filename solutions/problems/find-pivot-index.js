// Track the running left sum; the right sum is total - left - current.
function pivot_index(nums) {
  const total = nums.reduce((a, b) => a + b, 0);
  let left = 0;
  for (let i = 0; i < nums.length; i++) {
    const x = nums[i];
    if (left === total - left - x) return i;
    left += x;
  }
  return -1;
}
