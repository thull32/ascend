function subarrays_with_k_distinct(nums, k) {
  function atMost(m) {
    if (m <= 0) return 0;
    const counts = new Map();
    let left = 0;
    let total = 0;
    for (let right = 0; right < nums.length; right++) {
      const x = nums[right];
      counts.set(x, (counts.get(x) || 0) + 1);
      while (counts.size > m) {
        const y = nums[left];
        counts.set(y, counts.get(y) - 1);
        if (counts.get(y) === 0) counts.delete(y);
        left++;
      }
      total += right - left + 1;
    }
    return total;
  }

  return atMost(k) - atMost(k - 1);
}
