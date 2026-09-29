function count_divisible_subarrays(nums, k) {
  const counts = new Array(k).fill(0);
  counts[0] = 1;
  let remainder = 0;
  let total = 0;
  for (const x of nums) {
    remainder = ((remainder + x) % k + k) % k;
    total += counts[remainder];
    counts[remainder]++;
  }
  return total;
}
