// Reverse Integer: pop/push digit loop with an overflow check performed
// BEFORE the push, so the dangerous operation never actually happens.
function reverse(x) {
  const INT_MAX = 2 ** 31 - 1; // 2147483647
  const INT_MIN_MAG = 2 ** 31; // 2147483648, magnitude of -2**31

  const negative = x < 0;
  const limit = negative ? INT_MIN_MAG : INT_MAX;
  let n = Math.abs(x);
  let result = 0;
  while (n !== 0) {
    const d = n % 10;
    n = Math.trunc(n / 10);
    if (result > Math.floor((limit - d) / 10)) {
      return 0;
    }
    result = result * 10 + d;
  }
  return negative ? -result : result;
}
