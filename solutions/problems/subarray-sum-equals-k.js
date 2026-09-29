// Prefix sums: a subarray sums to k exactly when running - k has been seen
// as an earlier prefix sum; count how many times.
function subarray_sum(nums, k) {
  const seen = new Map([[0, 1]]); // the empty prefix
  let running = 0;
  let count = 0;
  for (const x of nums) {
    running += x;
    count += seen.get(running - k) || 0;
    seen.set(running, (seen.get(running) || 0) + 1);
  }
  return count;
}
