function min_obstacles(grid) {
  const rows = grid.length, cols = grid[0].length;
  const dist = Array.from({ length: rows }, () => new Array(cols).fill(Infinity));
  dist[0][0] = 0;
  let dq = [[0, 0]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (dq.length) {
    const [r, c] = dq.shift();
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const cost = grid[nr][nc];
        const nd = dist[r][c] + cost;
        if (nd < dist[nr][nc]) {
          dist[nr][nc] = nd;
          if (cost === 0) {
            dq.unshift([nr, nc]);
          } else {
            dq.push([nr, nc]);
          }
        }
      }
    }
  }

  return dist[rows - 1][cols - 1];
}
