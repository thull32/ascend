function min_walls(grid) {
  const rows = grid.length, cols = grid[0].length;
  const dist = Array.from({ length: rows }, () => new Array(cols).fill(Infinity));
  dist[0][0] = grid[0][0];
  const deltas = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let head = 0;
  const buf = [[0, 0]];
  while (head < buf.length) {
    const [r, c] = buf[head];
    head++;
    const d = dist[r][c];
    for (const [dr, dc] of deltas) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const w = grid[nr][nc];
        const nd = d + w;
        if (nd < dist[nr][nc]) {
          dist[nr][nc] = nd;
          if (w === 0) {
            buf.splice(head, 0, [nr, nc]);
          } else {
            buf.push([nr, nc]);
          }
        }
      }
    }
  }
  return dist[rows - 1][cols - 1];
}
