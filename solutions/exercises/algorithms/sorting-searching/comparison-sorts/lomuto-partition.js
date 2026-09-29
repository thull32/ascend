function lomuto_partition(nums) {
  const pivot = nums[nums.length - 1];
  let i = -1;
  for (let j = 0; j < nums.length - 1; j++) {
    if (nums[j] <= pivot) {
      i++;
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
  }
  [nums[i + 1], nums[nums.length - 1]] = [nums[nums.length - 1], nums[i + 1]];
  return [i + 1, nums];
}
