function count_pairs_below(nums, target) {
  const arr = [...nums].sort((a, b) => a - b);
  let lo = 0, hi = arr.length - 1;
  let count = 0;
  while (lo < hi) {
    if (arr[lo] + arr[hi] < target) {
      count += hi - lo;
      lo += 1;
    } else {
      hi -= 1;
    }
  }
  return count;
}
