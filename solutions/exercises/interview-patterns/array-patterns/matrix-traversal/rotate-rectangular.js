function rotate_clockwise(matrix) {
  if (!matrix.length || !matrix[0].length) return [];
  const m = matrix.length;
  const n = matrix[0].length;
  const result = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      result[j][m - 1 - i] = matrix[i][j];
    }
  }
  return result;
}
