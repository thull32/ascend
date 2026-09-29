function majority_vote_accuracy(p, n) {
  function comb(n, k) {
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= k; i++) {
      result = (result * (n - k + i)) / i;
    }
    return Math.round(result);
  }

  let total = 0;
  for (let k = 0; k <= n; k++) {
    const pk = comb(n, k) * p ** k * (1 - p) ** (n - k);
    if (2 * k > n) {
      total += pk;
    } else if (2 * k === n) {
      total += pk / 2;
    }
  }
  return total;
}
