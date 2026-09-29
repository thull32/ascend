function spiral_order(matrix) {
  if (!matrix.length || !matrix[0].length) return [];
  let top = 0, bottom = matrix.length - 1;
  let left = 0, right = matrix[0].length - 1;
  const result = [];
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) result.push(matrix[top][c]);
    top += 1;
    for (let r = top; r <= bottom; r++) result.push(matrix[r][right]);
    right -= 1;
    if (top <= bottom) {
      for (let c = right; c >= left; c--) result.push(matrix[bottom][c]);
      bottom -= 1;
    }
    if (left <= right) {
      for (let r = bottom; r >= top; r--) result.push(matrix[r][left]);
      left += 1;
    }
  }
  return result;
}
