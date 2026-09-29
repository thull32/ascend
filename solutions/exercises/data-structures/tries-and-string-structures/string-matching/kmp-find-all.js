// KMP search: find every (possibly overlapping) starting index of pattern
// in text in O(n + m), using the failure function so the text pointer
// never moves backwards.

function _lps(pattern) {
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

function kmp_find_all(text, pattern) {
  const n = text.length;
  const m = pattern.length;
  const out = [];
  if (m === 0 || n < m) return out;

  const lps = _lps(pattern);
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (j > 0 && text[i] !== pattern[j]) {
      j = lps[j - 1];
    }
    if (text[i] === pattern[j]) {
      j += 1;
    }
    if (j === m) {
      out.push(i - m + 1);
      j = lps[j - 1];
    }
  }
  return out;
}
