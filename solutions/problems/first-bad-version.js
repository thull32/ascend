// Binary search for the first true in a monotonic boolean array.
function first_bad_version(is_bad) {
  let lo = 0, hi = is_bad.length - 1;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (is_bad[mid]) {
      hi = mid; // first bad is mid or earlier
    } else {
      lo = mid + 1; // first bad is after mid
    }
  }
  return lo;
}
