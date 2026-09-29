// Next Greater Element: monotonic stack of indices waiting for their answer.
function next_greater(nums) {
  const result = new Array(nums.length).fill(-1);
  const stack = [];
  for (let i = 0; i < nums.length; i++) {
    const x = nums[i];
    while (stack.length > 0 && nums[stack[stack.length - 1]] < x) {
      result[stack.pop()] = x;
    }
    stack.push(i);
  }
  return result;
}
