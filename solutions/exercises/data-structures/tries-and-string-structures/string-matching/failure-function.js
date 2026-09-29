// KMP failure (LPS) function: lps[i] is the length of the longest proper
// prefix of pattern[0..i] that is also a suffix of it. O(m) via fall-back
// through lps[k - 1] on a mismatch.

function failure_function(pattern) {
  const m = pattern.length;
  const lps = new Array(m).fill(0);
  let k = 0;
  for (let i = 1; i < m; i++) {
    while (k > 0 && pattern[i] !== pattern[k]) {
      k = lps[k - 1];
    }
    if (pattern[i] === pattern[k]) {
      k += 1;
    }
    lps[i] = k;
  }
  return lps;
}
