function closest_subset_sum(nums, goal) {
  const n = nums.length;
  const mid = Math.floor(n / 2);
  const left = nums.slice(0, mid);
  const right = nums.slice(mid);

  function subsetSums(arr) {
    let sums = [0];
    for (const x of arr) {
      const extra = sums.map((s) => s + x);
      sums = sums.concat(extra);
    }
    return sums;
  }

  const leftSums = subsetSums(left);
  const rightSums = subsetSums(right).sort((a, b) => a - b);

  function lowerBound(target) {
    let lo = 0, hi = rightSums.length;
    while (lo < hi) {
      const m = Math.floor((lo + hi) / 2);
      if (rightSums[m] < target) {
        lo = m + 1;
      } else {
        hi = m;
      }
    }
    return lo;
  }

  let best = null;
  for (const l of leftSums) {
    const target = goal - l;
    const idx = lowerBound(target);
    for (const cand of [idx - 1, idx]) {
      if (cand >= 0 && cand < rightSums.length) {
        const diff = Math.abs(l + rightSums[cand] - goal);
        if (best === null || diff < best) best = diff;
      }
    }
  }
  return best;
}
