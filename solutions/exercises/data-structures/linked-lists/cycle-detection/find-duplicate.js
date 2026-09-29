function find_duplicate(nums) {
  let slow = 0;
  let fast = 0;
  while (true) {
    slow = nums[slow];
    fast = nums[nums[fast]];
    if (slow === fast) break;
  }
  let p = 0;
  while (p !== slow) {
    p = nums[p];
    slow = nums[slow];
  }
  return p;
}
