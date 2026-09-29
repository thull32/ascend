function fast_pow_mod(base, exp, mod) {
  let result = 1 % mod;
  base = base % mod;
  while (exp > 0) {
    if (exp & 1) result = (result * base) % mod;
    base = (base * base) % mod;
    exp = Math.floor(exp / 2);
  }
  return result;
}
