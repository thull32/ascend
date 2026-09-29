function move_zeroes(nums) {
  let write = 0;
  for (let read = 0; read < nums.length; read++) {
    if (nums[read] !== 0) {
      const tmp = nums[write];
      nums[write] = nums[read];
      nums[read] = tmp;
      write += 1;
    }
  }
  return nums;
}
