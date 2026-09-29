// Interval DP: best[i][j] is the best score bursting everything strictly
// between padded indices i and j, bursting last balloon k in that range last.
function max_coins(nums) {
  const p = [1, ...nums, 1];
  const size = p.length;
  const best = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let gap = 2; gap < size; gap++) {
    for (let i = 0; i < size - gap; i++) {
      const j = i + gap;
      const wall = p[i] * p[j];
      let top = 0;
      for (let k = i + 1; k < j; k++) {
        const value = best[i][k] + wall * p[k] + best[k][j];
        if (value > top) top = value;
      }
      best[i][j] = top;
    }
  }
  return best[0][size - 1];
}
