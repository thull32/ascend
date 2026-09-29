// Same boundary-shrinking walk as spiral traversal, but writing 1..n*n
// instead of reading.
function generate_matrix(n) {
  const grid = Array.from({ length: n }, () => new Array(n).fill(0));
  let top = 0, bottom = n - 1, left = 0, right = n - 1;
  let k = 1;
  while (k <= n * n) {
    for (let c = left; c <= right; c++) grid[top][c] = k++;
    top += 1;
    for (let r = top; r <= bottom; r++) grid[r][right] = k++;
    right -= 1;
    for (let c = right; c >= left; c--) grid[bottom][c] = k++;
    bottom -= 1;
    for (let r = bottom; r >= top; r--) grid[r][left] = k++;
    left += 1;
  }
  return grid;
}
