function min_jumps(nums) {
  const n = nums.length;
  let jumps = 0;
  let curEnd = 0;
  let far = 0;
  for (let i = 0; i < n - 1; i++) {
    far = Math.max(far, i + nums[i]);
    if (i === curEnd) {
      jumps++;
      curEnd = far;
    }
  }
  return jumps;
}
