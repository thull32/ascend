function next_greater(nums) {
  const n = nums.length;
  const ans = new Array(n).fill(-1);
  const stack = []; // indices, values strictly decreasing bottom to top
  for (let i = 0; i < n; i++) {
    while (stack.length > 0 && nums[stack[stack.length - 1]] < nums[i]) {
      const j = stack.pop();
      ans[j] = nums[i];
    }
    stack.push(i);
  }
  return ans;
}
