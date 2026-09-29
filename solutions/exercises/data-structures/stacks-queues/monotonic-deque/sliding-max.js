function sliding_max(nums, k) {
  if (nums.length === 0) return [];
  const dq = []; // indices, values strictly decreasing front to back
  let head = 0;  // logical front index into dq; avoids Array.shift
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    while (dq.length > head && nums[dq[dq.length - 1]] <= nums[i]) {
      dq.pop();
    }
    dq.push(i);
    if (dq[head] <= i - k) {
      head++;
    }
    if (i >= k - 1) {
      out.push(nums[dq[head]]);
    }
  }
  return out;
}
