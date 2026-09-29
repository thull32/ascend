function total_n_queens(n) {
  const full = (1 << n) - 1;

  function solve(cols, d1, d2) {
    if (cols === full) return 1;
    let free = full & ~(cols | d1 | d2);
    let count = 0;
    while (free) {
      const bit = free & (-free);
      free ^= bit;
      count += solve(cols | bit, (d1 | bit) << 1, (d2 | bit) >>> 1);
    }
    return count;
  }

  return solve(0, 0, 0);
}
