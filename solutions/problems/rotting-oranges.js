// Rotting Oranges: multi-source BFS, expanding one minute per wave.
function oranges_rotting(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  let queue = [];
  let fresh = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 2) {
        queue.push([r, c]);
      } else if (grid[r][c] === 1) {
        fresh += 1;
      }
    }
  }

  let minutes = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length > 0 && fresh > 0) {
    const next = [];
    for (const [r, c] of queue) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 1) {
          grid[nr][nc] = 2;
          fresh -= 1;
          next.push([nr, nc]);
        }
      }
    }
    queue = next;
    minutes += 1;
  }
  return fresh === 0 ? minutes : -1;
}
