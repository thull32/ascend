function prune_row_groups(stats, lo, hi) {
  const result = [];
  for (let i = 0; i < stats.length; i++) {
    const [mn, mx] = stats[i];
    if (mn === null) continue;
    if (lo !== null && mx < lo) continue;
    if (hi !== null && mn > hi) continue;
    result.push(i);
  }
  return result;
}
