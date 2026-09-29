// Shrink a rectangular boundary layer by layer: top row, right column,
// bottom row, left column, guarding the last two against re-visiting.
function spiral_order(matrix) {
  const out = [];
  let top = 0, bottom = matrix.length - 1;
  let left = 0, right = matrix[0].length - 1;
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) out.push(matrix[top][c]);
    top += 1;
    for (let r = top; r <= bottom; r++) out.push(matrix[r][right]);
    right -= 1;
    if (top <= bottom) {
      for (let c = right; c >= left; c--) out.push(matrix[bottom][c]);
      bottom -= 1;
    }
    if (left <= right) {
      for (let r = bottom; r >= top; r--) out.push(matrix[r][left]);
      left += 1;
    }
  }
  return out;
}
