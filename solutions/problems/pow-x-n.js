// Pow(x, n): exponentiation by squaring (binary exponentiation).
// JavaScript's bitwise operators are 32-bit, so use n % 2 / Math.floor(n / 2)
// instead of n & 1 / n >>= 1 to stay correct for large n.
function my_pow(x, n) {
  if (n < 0) {
    x = 1.0 / x;
    n = -n;
  }
  let result = 1.0;
  let base = x;
  while (n > 0) {
    if (n % 2 === 1) {
      result *= base;
    }
    base *= base;
    n = Math.floor(n / 2);
  }
  return Math.round(result * 1e5) / 1e5;
}
