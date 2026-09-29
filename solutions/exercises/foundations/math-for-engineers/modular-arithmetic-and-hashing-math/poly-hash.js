function poly_hash(s, base, mod) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * base + s.charCodeAt(i)) % mod;
  }
  return h;
}
