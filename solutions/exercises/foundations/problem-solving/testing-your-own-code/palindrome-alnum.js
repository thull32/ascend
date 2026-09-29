function is_palindrome_alnum(s) {
  const filtered = [];
  for (const ch of s) {
    if (/[A-Za-z0-9]/.test(ch)) {
      filtered.push(ch.toLowerCase());
    }
  }
  const reversed = filtered.slice().reverse();
  return filtered.join("") === reversed.join("");
}
