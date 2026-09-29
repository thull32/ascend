function quic_varint(n) {
  let length;
  if (n < 2 ** 6) length = 1;
  else if (n < 2 ** 14) length = 2;
  else if (n < 2 ** 30) length = 4;
  else length = 8;

  const lengthBitsMap = { 1: 0n, 2: 1n, 4: 2n, 8: 3n };
  const lengthBits = lengthBitsMap[length];
  const value = BigInt(n) | (lengthBits << BigInt(8 * length - 2));

  return value.toString(16).padStart(length * 2, "0");
}
