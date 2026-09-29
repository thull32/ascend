// Remove Duplicates from Sorted Array: two-pointer in-place compaction.
function remove_duplicates(nums) {
  if (nums.length === 0) return [0, []];
  let write = 1;
  for (let read = 1; read < nums.length; read++) {
    if (nums[read] !== nums[write - 1]) {
      nums[write] = nums[read];
      write += 1;
    }
  }
  return [write, nums.slice(0, write)];
}
