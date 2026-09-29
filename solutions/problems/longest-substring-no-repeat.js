// Longest Substring Without Repeating Characters — sliding window with last-seen index jump.
function length_of_longest_substring(s) {
  const last = {};
  let left = 0;
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (Object.prototype.hasOwnProperty.call(last, ch) && last[ch] >= left) {
      left = last[ch] + 1; // jump past the previous occurrence
    }
    last[ch] = right;
    best = Math.max(best, right - left + 1);
  }
  return best;
}
