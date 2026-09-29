// Product of Array Except Self: prefix product from the left, suffix product from the right.
function product_except_self(nums) {
  const n = nums.length;
  const out = new Array(n).fill(1);

  let running = 1;
  for (let i = 0; i < n; i++) {
    out[i] = running;
    running *= nums[i];
  }

  running = 1;
  for (let i = n - 1; i >= 0; i--) {
    out[i] *= running;
    running *= nums[i];
  }
  return out;
}
