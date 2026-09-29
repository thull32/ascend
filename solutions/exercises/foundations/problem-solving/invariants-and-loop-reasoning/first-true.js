function first_true(flags) {
  let lo = 0;
  let hi = flags.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (flags[mid] === 1) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}
