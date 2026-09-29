function max_area_island(grid) {
  if (!grid.length || !grid[0].length) return 0;
  const rows = grid.length, cols = grid[0].length;
  let best = 0;

  function dfs(r, c) {
    if (r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] !== 1) return 0;
    grid[r][c] = 0;
    let area = 1;
    area += dfs(r + 1, c);
    area += dfs(r - 1, c);
    area += dfs(r, c + 1);
    area += dfs(r, c - 1);
    return area;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 1) {
        best = Math.max(best, dfs(r, c));
      }
    }
  }
  return best;
}
