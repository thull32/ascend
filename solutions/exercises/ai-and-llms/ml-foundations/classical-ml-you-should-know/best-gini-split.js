function best_split(xs, ys) {
  const n = xs.length;

  function gini(labels) {
    if (labels.length === 0) return 0;
    const p1 = labels.reduce((a, b) => a + b, 0) / labels.length;
    const p0 = 1 - p1;
    return 1 - p1 * p1 - p0 * p0;
  }

  const pairs = xs.map((x, i) => [x, ys[i]]);
  const distinct = [...new Set(xs)].sort((a, b) => a - b);
  if (distinct.length < 2) {
    return [null, gini(ys)];
  }

  let bestT = null;
  let bestScore = null;
  for (let i = 0; i < distinct.length - 1; i++) {
    const t = (distinct[i] + distinct[i + 1]) / 2;
    const left = pairs.filter(([x]) => x <= t).map(([, y]) => y);
    const right = pairs.filter(([x]) => x > t).map(([, y]) => y);
    const score = (left.length / n) * gini(left) + (right.length / n) * gini(right);
    if (bestScore === null || score < bestScore - 1e-9) {
      bestScore = score;
      bestT = t;
    }
  }
  return [bestT, bestScore];
}
