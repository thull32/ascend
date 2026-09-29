function min_diff_pairs(nums) {
  const arr = [...nums].sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 0; i < arr.length - 1; i++) {
    minGap = Math.min(minGap, arr[i + 1] - arr[i]);
  }
  const result = [];
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i + 1] - arr[i] === minGap) {
      result.push([arr[i], arr[i + 1]]);
    }
  }
  return result;
}
