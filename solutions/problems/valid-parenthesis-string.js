// Track the min and max possible number of unmatched '(' as '*' can be
// '(', ')', or empty; valid iff 0 is achievable at the end.
function check_valid_string(s) {
  let lo = 0, hi = 0; // min and max possible number of unmatched '('
  for (const ch of s) {
    if (ch === "(") {
      lo += 1;
      hi += 1;
    } else if (ch === ")") {
      lo -= 1;
      hi -= 1;
    } else {
      // '*'
      lo -= 1;
      hi += 1;
    }
    if (hi < 0) return false; // too many ')' even if every '*' is '('
    lo = Math.max(lo, 0); // a negative open count is not a real state
  }
  return lo === 0;
}
