function floor_log2(n) {
  let count = 0;
  while (n > 1) {
    n = Math.floor(n / 2);
    count += 1;
  }
  return count;
}
