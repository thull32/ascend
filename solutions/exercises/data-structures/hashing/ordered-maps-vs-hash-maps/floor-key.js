function floor_key(keys, x) {
  let lo = 0, hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? keys[lo - 1] : null;
}
