function kadane(arr) {
  let current = arr[0];
  let best = arr[0];
  for (let i = 1; i < arr.length; i++) {
    current = Math.max(arr[i], current + arr[i]);
    best = Math.max(best, current);
  }
  return best;
}

function max_k_concat(nums, k) {
  const total = nums.reduce((a, b) => a + b, 0);
  if (k === 1) return kadane(nums);

  const bestTwo = kadane(nums.concat(nums));
  if (total > 0) {
    return bestTwo + (k - 2) * total;
  }
  return bestTwo;
}
