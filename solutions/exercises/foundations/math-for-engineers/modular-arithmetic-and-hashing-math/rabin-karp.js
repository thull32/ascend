function rabin_karp(text, pattern, base, mod) {
  const n = text.length;
  const m = pattern.length;
  if (m > n) return [];

  let high = 1;
  for (let i = 0; i < m - 1; i++) {
    high = (high * base) % mod;
  }

  let pHash = 0;
  for (let i = 0; i < m; i++) {
    pHash = (pHash * base + pattern.charCodeAt(i)) % mod;
  }

  let h = 0;
  for (let i = 0; i < m; i++) {
    h = (h * base + text.charCodeAt(i)) % mod;
  }

  const result = [];
  for (let i = 0; i <= n - m; i++) {
    if (h === pHash && text.slice(i, i + m) === pattern) {
      result.push(i);
    }
    if (i + m < n) {
      h = (h - (text.charCodeAt(i) * high) % mod + mod) % mod;
      h = (h * base + text.charCodeAt(i + m)) % mod;
    }
  }
  return result;
}
