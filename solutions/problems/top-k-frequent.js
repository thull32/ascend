// Bucket by frequency (frequency can't exceed nums.length), then read the
// buckets from highest frequency down until k values are collected.
function top_k_frequent(nums, k) {
  const counts = new Map();
  for (const x of nums) counts.set(x, (counts.get(x) || 0) + 1);

  const buckets = Array.from({ length: nums.length + 1 }, () => []);
  for (const [value, freq] of counts) buckets[freq].push(value);

  const out = [];
  for (let freq = nums.length; freq >= 1; freq--) {
    for (const value of buckets[freq]) {
      out.push(value);
      if (out.length === k) return out;
    }
  }
  return out;
}
