// Regular Expression Matching: DP over (string prefix, pattern prefix),
// space-optimized to two rows.
function is_match(s, p) {
  const n = p.length;
  let prev = new Array(n + 1).fill(false);

  for (let i = 0; i <= s.length; i++) {
    const cur = new Array(n + 1).fill(false);
    cur[0] = i === 0;
    for (let j = 1; j <= n; j++) {
      if (p[j - 1] === "*") {
        cur[j] =
          cur[j - 2] ||
          (i > 0 && (p[j - 2] === "." || p[j - 2] === s[i - 1]) && prev[j]);
      } else {
        cur[j] =
          i > 0 && (p[j - 1] === "." || p[j - 1] === s[i - 1]) && prev[j - 1];
      }
    }
    prev = cur;
  }
  return prev[n];
}
