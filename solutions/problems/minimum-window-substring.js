// Minimum Window Substring: sliding window with a "formed" counter for O(1) goodness checks.
function min_window(s, t) {
  if (s.length === 0 || t.length === 0) {
    return "";
  }
  const need = new Map();
  for (const ch of t) {
    need.set(ch, (need.get(ch) || 0) + 1);
  }
  const required = need.size;

  const have = new Map();
  let formed = 0;
  let bestLen = Infinity;
  let bestLo = 0;
  let left = 0;

  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    have.set(ch, (have.get(ch) || 0) + 1);
    if (need.has(ch) && have.get(ch) === need.get(ch)) {
      formed += 1;
    }

    while (formed === required) {
      if (right - left + 1 < bestLen) {
        bestLen = right - left + 1;
        bestLo = left;
      }
      const out = s[left];
      have.set(out, have.get(out) - 1);
      if (need.has(out) && have.get(out) < need.get(out)) {
        formed -= 1;
      }
      left += 1;
    }
  }

  return bestLen === Infinity ? "" : s.slice(bestLo, bestLo + bestLen);
}
