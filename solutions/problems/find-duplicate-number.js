// Floyd's cycle detection: treat nums as a function i -> nums[i]; the
// duplicate value is the entry point of the cycle this induces.
function find_duplicate(nums) {
  let slow = 0, fast = 0;
  while (true) {
    slow = nums[slow];
    fast = nums[nums[fast]];
    if (slow === fast) break;
  }
  let finder = 0;
  while (finder !== slow) {
    finder = nums[finder];
    slow = nums[slow];
  }
  return finder;
}
