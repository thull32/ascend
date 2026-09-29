// Longest Palindromic Substring — expand around each of the 2n-1 centres.
function longest_palindrome(s) {
  let bestI = 0;
  let bestLen = 1;
  for (let centre = 0; centre < 2 * s.length - 1; centre++) {
    let lo = Math.floor(centre / 2);
    let hi = lo + (centre % 2); // odd centres sit between lo and lo + 1
    while (lo >= 0 && hi < s.length && s[lo] === s[hi]) {
      lo -= 1;
      hi += 1;
    }
    const length = hi - lo - 1; // the loop overshot by one on each side
    if (length > bestLen) {
      bestI = lo + 1;
      bestLen = length;
    }
  }
  return s.slice(bestI, bestI + bestLen);
}
