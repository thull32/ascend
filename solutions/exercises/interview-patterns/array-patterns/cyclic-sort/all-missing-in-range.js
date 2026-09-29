function find_missing(nums) {
  const arr = [...nums];
  const n = arr.length;
  let i = 0;
  while (i < n) {
    const j = arr[i] - 1;
    if (arr[j] !== arr[i]) {
      [arr[i], arr[j]] = [arr[j], arr[i]];
    } else {
      i += 1;
    }
  }
  const result = [];
  for (let k = 0; k < n; k++) {
    if (arr[k] !== k + 1) result.push(k + 1);
  }
  return result;
}
