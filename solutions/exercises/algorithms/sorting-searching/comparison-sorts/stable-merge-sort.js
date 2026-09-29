function merge_sort(nums) {
  if (nums.length <= 1) return nums.slice();
  const mid = Math.floor(nums.length / 2);
  const left = merge_sort(nums.slice(0, mid));
  const right = merge_sort(nums.slice(mid));
  const result = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      result.push(left[i]);
      i++;
    } else {
      result.push(right[j]);
      j++;
    }
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}
