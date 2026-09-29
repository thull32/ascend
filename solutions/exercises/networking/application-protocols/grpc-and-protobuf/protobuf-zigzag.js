// Encode a protobuf sint64 value: ZigZag map, then varint-encode.
// Use arithmetic rather than << and >>, which truncate to 32 bits in JS.

function encode_sint(n) {
  let z = n >= 0 ? 2 * n : -2 * n - 1;
  const out = [];
  while (true) {
    const byte = z % 128;
    z = Math.floor(z / 128);
    if (z) {
      out.push(byte + 128);
    } else {
      out.push(byte);
      return out;
    }
  }
}
