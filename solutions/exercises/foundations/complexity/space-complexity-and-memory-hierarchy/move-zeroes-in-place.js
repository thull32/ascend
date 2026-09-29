function move_zeroes(nums) {
  let w = 0;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== 0) {
      nums[w] = nums[i];
      w += 1;
    }
  }
  for (let i = w; i < nums.length; i++) {
    nums[i] = 0;
  }
  return nums;
}
