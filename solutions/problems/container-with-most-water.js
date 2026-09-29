// Two pointers from the ends; always advance the shorter side, since keeping
// it can never beat swapping it for a possibly-taller line.
function max_area(heights) {
  let lo = 0, hi = heights.length - 1;
  let best = 0;
  while (lo < hi) {
    const h = Math.min(heights[lo], heights[hi]);
    best = Math.max(best, (hi - lo) * h);
    if (heights[lo] <= heights[hi]) lo += 1;
    else hi -= 1;
  }
  return best;
}
