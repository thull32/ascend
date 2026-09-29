function halvings(n) {
  let count = 0;
  while (n > 0) {
    n = Math.floor(n / 2);
    count += 1;
  }
  return count;
}
