// Max Area of Island — flood fill each island, counting cells marked on push.
function max_area_of_island(grid) {
  if (!grid.length || !grid[0].length) return 0;
  const rows = grid.length;
  const cols = grid[0].length;
  let best = 0;
  for (let r0 = 0; r0 < rows; r0++) {
    for (let c0 = 0; c0 < cols; c0++) {
      if (grid[r0][c0] !== 1) continue;
      grid[r0][c0] = 0; // mark on push
      const stack = [[r0, c0]];
      let area = 1;
      while (stack.length) {
        const [r, c] = stack.pop();
        const neighbors = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]];
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 1) {
            grid[nr][nc] = 0;
            stack.push([nr, nc]);
            area += 1;
          }
        }
      }
      best = Math.max(best, area);
    }
  }
  return best;
}
