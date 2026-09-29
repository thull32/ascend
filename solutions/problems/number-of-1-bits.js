// Number of 1 Bits: Brian Kernighan's method, n &= n - 1 clears the lowest set bit.
// n can be up to 2^32 - 1, which exceeds signed 32-bit range, so use >>> 0 style unsigned math.
function hamming_weight(n) {
  let count = 0;
  let x = n >>> 0;
  while (x !== 0) {
    x = (x & (x - 1)) >>> 0;
    count += 1;
  }
  return count;
}
