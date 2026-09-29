// Set Matrix Zeroes: use row 0 and column 0 of the matrix itself as the marker
// arrays, tracking their own original zero-ness separately.
function set_zeroes(matrix) {
  const m = matrix.length;
  const n = matrix[0].length;

  let firstRowZero = false;
  for (let c = 0; c < n; c++) {
    if (matrix[0][c] === 0) { firstRowZero = true; break; }
  }
  let firstColZero = false;
  for (let r = 0; r < m; r++) {
    if (matrix[r][0] === 0) { firstColZero = true; break; }
  }

  // 1. Mark: an interior zero writes a 0 into its row head and column head.
  for (let r = 1; r < m; r++) {
    for (let c = 1; c < n; c++) {
      if (matrix[r][c] === 0) {
        matrix[r][0] = 0;
        matrix[0][c] = 0;
      }
    }
  }

  // 2. Clear the interior from the marks.
  for (let r = 1; r < m; r++) {
    for (let c = 1; c < n; c++) {
      if (matrix[r][0] === 0 || matrix[0][c] === 0) {
        matrix[r][c] = 0;
      }
    }
  }

  // 3. Finally the first row and first column themselves.
  if (firstRowZero) {
    for (let c = 0; c < n; c++) matrix[0][c] = 0;
  }
  if (firstColZero) {
    for (let r = 0; r < m; r++) matrix[r][0] = 0;
  }
  return matrix;
}
