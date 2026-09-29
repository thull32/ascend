function poly_hash(s, base, m) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * base + s.charCodeAt(i)) % m;
  }
  return h;
}
