// Count characters of s, then decrement for each character of t; any
// negative count or length mismatch means it isn't an anagram.
function is_anagram(s, t) {
  if (s.length !== t.length) return false;
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) || 0) + 1);
  for (const ch of t) {
    const c = (counts.get(ch) || 0) - 1;
    if (c < 0) return false;
    counts.set(ch, c);
  }
  return true;
}
