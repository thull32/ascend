// Number of Islands: scan the grid, flood-fill (sink in place) each unvisited land component.
function num_islands(grid) {
  if (!grid || grid.length === 0 || grid[0].length === 0) {
    return 0;
  }
  const rows = grid.length;
  const cols = grid[0].length;
  let count = 0;

  for (let r0 = 0; r0 < rows; r0++) {
    for (let c0 = 0; c0 < cols; c0++) {
      if (grid[r0][c0] !== "1") {
        continue;
      }
      count += 1;
      grid[r0][c0] = "0";
      const stack = [[r0, c0]];
      while (stack.length > 0) {
        const [r, c] = stack.pop();
        const neighbors = [
          [r + 1, c],
          [r - 1, c],
          [r, c + 1],
          [r, c - 1],
        ];
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === "1") {
            grid[nr][nc] = "0";
            stack.push([nr, nc]);
          }
        }
      }
    }
  }
  return count;
}
