// Bit-trick addition: XOR gives the sum without carries, AND shifted left
// gives the carries; repeat until no carries remain. JS's `&`, `^`, `<<`
// already operate on 32-bit signed integers, so no explicit masking is
// needed the way Python's arbitrary-precision ints require.
function get_sum(a, b) {
  while (b !== 0) {
    const carry = (a & b) << 1;
    a = a ^ b;
    b = carry;
  }
  return a;
}
