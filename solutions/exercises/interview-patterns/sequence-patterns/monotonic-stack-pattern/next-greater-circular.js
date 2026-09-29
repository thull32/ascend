function next_greater_circular(nums) {
  const n = nums.length;
  if (n === 0) return [];
  const result = new Array(n).fill(-1);
  const stack = [];
  for (let i = 0; i < 2 * n; i++) {
    const x = nums[i % n];
    while (stack.length && nums[stack[stack.length - 1]] < x) {
      result[stack.pop()] = x;
    }
    if (i < n) stack.push(i);
  }
  return result;
}
