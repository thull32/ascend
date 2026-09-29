function min_abs_difference(a, b) {
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  let i = 0, j = 0;
  let best = Infinity;
  while (i < sa.length && j < sb.length) {
    best = Math.min(best, Math.abs(sa[i] - sb[j]));
    if (sa[i] < sb[j]) {
      i++;
    } else {
      j++;
    }
  }
  return best;
}
