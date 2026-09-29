// Longest Increasing Path in a Matrix — process cells in decreasing value order.
function longest_increasing_path(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const best = Array.from({ length: rows }, () => new Array(cols).fill(1));
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push([matrix[r][c], r, c]);
    }
  }
  cells.sort((a, b) => b[0] - a[0]); // largest values first

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let answer = 1;
  for (const [value, r, c] of cells) {
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && matrix[nr][nc] > value) {
        if (best[nr][nc] + 1 > best[r][c]) {
          best[r][c] = best[nr][nc] + 1;
        }
      }
    }
    answer = Math.max(answer, best[r][c]);
  }
  return answer;
}
