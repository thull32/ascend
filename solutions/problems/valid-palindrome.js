// Two pointers from the ends, skipping non-alphanumeric characters and
// comparing case-insensitively.
function is_palindrome(s) {
  const isAlnum = (ch) => /[a-zA-Z0-9]/.test(ch);
  let lo = 0, hi = s.length - 1;
  while (lo < hi) {
    while (lo < hi && !isAlnum(s[lo])) lo += 1;
    while (lo < hi && !isAlnum(s[hi])) hi -= 1;
    if (s[lo].toLowerCase() !== s[hi].toLowerCase()) return false;
    lo += 1;
    hi -= 1;
  }
  return true;
}
