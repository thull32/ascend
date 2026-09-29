// Dutch national flag: three pointers partition into 0s, 1s, 2s in one pass.
function sort_colors(nums) {
  let lo = 0, mid = 0, hi = nums.length - 1;
  while (mid <= hi) {
    if (nums[mid] === 0) {
      [nums[lo], nums[mid]] = [nums[mid], nums[lo]];
      lo += 1;
      mid += 1;
    } else if (nums[mid] === 1) {
      mid += 1;
    } else {
      [nums[mid], nums[hi]] = [nums[hi], nums[mid]];
      hi -= 1;
    }
  }
  return nums;
}
