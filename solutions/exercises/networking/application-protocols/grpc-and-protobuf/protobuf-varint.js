// Encode a non-negative integer as a protobuf varint.
// n can be as large as 2^53 - 1, so use arithmetic, not bitwise operators.

function encode_varint(n) {
  const out = [];
  while (true) {
    const byte = n % 128;
    n = Math.floor(n / 128);
    if (n) {
      out.push(byte + 128);
    } else {
      out.push(byte);
      return out;
    }
  }
}
