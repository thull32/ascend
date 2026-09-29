// Longest Repeating Character Replacement — sliding window, window never contracts.
function character_replacement(s, k) {
  const counts = {};
  let left = 0;
  let maxCount = 0;
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    counts[ch] = (counts[ch] || 0) + 1;
    maxCount = Math.max(maxCount, counts[ch]);
    if ((right - left + 1) - maxCount > k) {
      counts[s[left]] -= 1;
      left += 1;
    }
    best = Math.max(best, right - left + 1);
  }
  return best;
}
