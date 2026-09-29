// Sort, fix the smallest element, then two-pointer the rest; skip repeated
// values at each position to avoid duplicate triples.
function three_sum(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  const out = [];
  for (let i = 0; i < n - 2; i++) {
    if (sorted[i] > 0) break; // everything after is positive too
    if (i > 0 && sorted[i] === sorted[i - 1]) continue; // same first element as last time
    let lo = i + 1, hi = n - 1;
    while (lo < hi) {
      const s = sorted[i] + sorted[lo] + sorted[hi];
      if (s < 0) {
        lo += 1;
      } else if (s > 0) {
        hi -= 1;
      } else {
        out.push([sorted[i], sorted[lo], sorted[hi]]);
        lo += 1;
        hi -= 1;
        while (lo < hi && sorted[lo] === sorted[lo - 1]) lo += 1;
        while (lo < hi && sorted[hi] === sorted[hi + 1]) hi -= 1;
      }
    }
  }
  return out;
}
