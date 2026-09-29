function max_subarray_sum(nums) {
  function best(lo, hi) {
    if (lo === hi) return nums[lo];
    const mid = Math.floor((lo + hi) / 2);
    const leftBest = best(lo, mid);
    const rightBest = best(mid + 1, hi);

    let leftCross = nums[mid];
    let running = 0;
    for (let i = mid; i >= lo; i--) {
      running += nums[i];
      if (running > leftCross) leftCross = running;
    }

    let rightCross = nums[mid + 1];
    running = 0;
    for (let i = mid + 1; i <= hi; i++) {
      running += nums[i];
      if (running > rightCross) rightCross = running;
    }

    const crossing = leftCross + rightCross;
    return Math.max(leftBest, rightBest, crossing);
  }

  return best(0, nums.length - 1);
}
