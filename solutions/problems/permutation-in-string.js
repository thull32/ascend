// Permutation in String: fixed-size sliding window with a "matches" counter.
function check_inclusion(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  if (m > n) return false;

  const need = new Array(26).fill(0);
  const have = new Array(26).fill(0);
  for (let i = 0; i < m; i++) {
    need[s1.charCodeAt(i) - 97]++;
    have[s2.charCodeAt(i) - 97]++;
  }

  let matches = 0;
  for (let i = 0; i < 26; i++) {
    if (need[i] === have[i]) matches++;
  }
  if (matches === 26) return true;

  for (let right = m; right < n; right++) {
    const enter = s2.charCodeAt(right) - 97;
    const leave = s2.charCodeAt(right - m) - 97;

    have[enter]++;
    if (have[enter] === need[enter]) {
      matches++;
    } else if (have[enter] === need[enter] + 1) {
      matches--;
    }

    have[leave]--;
    if (have[leave] === need[leave]) {
      matches++;
    } else if (have[leave] === need[leave] - 1) {
      matches--;
    }

    if (matches === 26) return true;
  }
  return false;
}
