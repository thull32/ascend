function pow_mod(base, exp, mod) {
  let m = BigInt(mod);
  let b = BigInt(base) % m;
  let e = BigInt(exp);
  let result = 1n % m;
  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % m;
    }
    b = (b * b) % m;
    e >>= 1n;
  }
  return Number(result);
}
