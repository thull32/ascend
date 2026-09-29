// Move Zeroes: stable partition with read/write pointers, copy non-zeros then fill zeros.
function move_zeroes(nums) {
  let write = 0;
  for (let read = 0; read < nums.length; read++) {
    if (nums[read] !== 0) {
      nums[write] = nums[read];
      write += 1;
    }
  }
  for (let i = write; i < nums.length; i++) {
    nums[i] = 0;
  }
  return nums;
}
