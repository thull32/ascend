// Two pointers from the ends, always advancing the side with the smaller
// height: the water above it is bounded by the max seen on that side so far.
function trap(heights) {
  let lo = 0, hi = heights.length - 1;
  let leftMax = 0, rightMax = 0;
  let water = 0;
  while (lo < hi) {
    if (heights[lo] < heights[hi]) {
      leftMax = Math.max(leftMax, heights[lo]);
      water += leftMax - heights[lo];
      lo += 1;
    } else {
      rightMax = Math.max(rightMax, heights[hi]);
      water += rightMax - heights[hi];
      hi -= 1;
    }
  }
  return water;
}
