// Sliding Window Maximum: monotonic deque of indices (values strictly
// decreasing front to back). Implemented as a circular-growth array with
// head/tail indices instead of a native deque (JS has none).
function max_sliding_window(nums, k) {
  const n = nums.length;
  const dq = new Array(n); // holds indices
  let head = 0;
  let tail = 0; // valid range is [head, tail)
  const out = [];

  for (let i = 0; i < n; i++) {
    while (tail > head && nums[dq[tail - 1]] <= nums[i]) {
      tail--; // dominated by nums[i]
    }
    dq[tail++] = i;
    if (dq[head] <= i - k) {
      head++; // fell out of the window
    }
    if (i >= k - 1) {
      out.push(nums[dq[head]]);
    }
  }
  return out;
}
