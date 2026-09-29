function grid_paths(m, n) {
  function n_choose_k(a, b) {
    if (b < 0 || b > a) return 0;
    b = Math.min(b, a - b);
    let result = 1;
    for (let i = 1; i <= b; i++) {
      result = (result * (a - b + i)) / i;
    }
    return Math.round(result);
  }
  return n_choose_k(m + n - 2, m - 1);
}
