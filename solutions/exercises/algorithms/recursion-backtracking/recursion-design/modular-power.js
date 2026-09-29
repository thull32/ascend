function mod_pow(base, exp, mod) {
  if (exp === 0) return 1 % mod;
  const half = mod_pow(base, Math.floor(exp / 2), mod);
  let result = (half * half) % mod;
  if (exp % 2 === 1) result = (result * base) % mod;
  return result;
}
