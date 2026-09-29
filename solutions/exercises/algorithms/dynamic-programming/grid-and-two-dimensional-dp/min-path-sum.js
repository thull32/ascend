function min_path_sum(grid) {
  const m = grid.length;
  const n = grid[0].length;
  const row = new Array(n).fill(Infinity);
  row[0] = 0;
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) {
      const left = c > 0 ? row[c - 1] : Infinity;
      const up = row[c];
      row[c] = grid[r][c] + Math.min(left, up);
    }
  }
  return row[n - 1];
}
