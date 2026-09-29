// Binary search for the largest integer whose square doesn't exceed x.
function my_sqrt(x) {
  let lo = 0, hi = x;
  let answer = 0;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (mid * mid <= x) {
      answer = mid; // mid works; look for something larger
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return answer;
}
