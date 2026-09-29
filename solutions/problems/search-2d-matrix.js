// Search a 2D Matrix: treat the matrix as a flattened sorted array and binary search it.
function search_matrix(matrix, target) {
  if (!matrix || matrix.length === 0 || matrix[0].length === 0) return false;
  const m = matrix.length;
  const n = matrix[0].length;
  let lo = 0;
  let hi = m * n - 1;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const value = matrix[Math.floor(mid / n)][mid % n];
    if (value === target) {
      return true;
    } else if (value < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return false;
}
