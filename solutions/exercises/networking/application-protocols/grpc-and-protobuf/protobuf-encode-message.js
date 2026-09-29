// Encode a protobuf message from [field_number, value] pairs.
// Integers use wire type 0; strings use wire type 2.

function encode_varint(n) {
  const out = [];
  while (true) {
    const byte = n % 128;
    n = Math.floor(n / 128);
    if (n) out.push(byte + 128);
    else {
      out.push(byte);
      return out;
    }
  }
}

function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i);
    if (code > 0xffff) i++; // consume the low surrogate too
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return out;
}

function encode_message(fields) {
  const out = [];
  for (const [fieldNumber, value] of fields) {
    if (typeof value === "string") {
      const tag = fieldNumber * 8 + 2;
      out.push(...encode_varint(tag));
      const data = utf8Bytes(value);
      out.push(...encode_varint(data.length));
      out.push(...data);
    } else {
      const tag = fieldNumber * 8 + 0;
      out.push(...encode_varint(tag));
      out.push(...encode_varint(value));
    }
  }
  return out;
}
