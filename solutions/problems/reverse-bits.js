// Reverse Bits: pop bits from n's bottom, push onto result's bottom, exactly 32 rounds.
// Uses >>> (unsigned) throughout so results stay unsigned 32-bit.
function reverse_bits(n) {
  let result = 0;
  for (let i = 0; i < 32; i++) {
    result = (result << 1) | (n & 1);
    n >>>= 1;
  }
  return result >>> 0;
}
