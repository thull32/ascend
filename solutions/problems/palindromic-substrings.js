// Palindromic Substrings: expand around each of the 2n - 1 centres, counting each successful step.
function count_palindromic_substrings(s) {
  const n = s.length;
  let count = 0;
  for (let centre = 0; centre < 2 * n - 1; centre++) {
    let lo = Math.floor(centre / 2);
    let hi = lo + (centre % 2);
    while (lo >= 0 && hi < n && s[lo] === s[hi]) {
      count += 1;
      lo -= 1;
      hi += 1;
    }
  }
  return count;
}
