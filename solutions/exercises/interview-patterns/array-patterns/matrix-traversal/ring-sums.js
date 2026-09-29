function ring_sums(matrix) {
  if (!matrix.length || !matrix[0].length) return [];
  let top = 0, bottom = matrix.length - 1;
  let left = 0, right = matrix[0].length - 1;
  const result = [];
  while (top <= bottom && left <= right) {
    let total = 0;
    for (let c = left; c <= right; c++) total += matrix[top][c];
    if (top < bottom) {
      for (let r = top + 1; r <= bottom; r++) total += matrix[r][right];
    }
    if (top < bottom && left < right) {
      for (let c = right - 1; c >= left; c--) total += matrix[bottom][c];
    }
    if (left < right && top + 1 < bottom) {
      for (let r = bottom - 1; r > top; r--) total += matrix[r][left];
    }
    result.push(total);
    top += 1;
    bottom -= 1;
    left += 1;
    right -= 1;
  }
  return result;
}
