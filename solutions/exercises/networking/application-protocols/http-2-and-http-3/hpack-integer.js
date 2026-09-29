// HPACK prefix integer encoding (RFC 7541, section 5.1).

function hpack_int(value, prefix_bits) {
  const out = [];
  const limit = 2 ** prefix_bits - 1;
  if (value < limit) {
    out.push(value);
    return out;
  }
  out.push(limit);
  let remainder = value - limit;
  while (remainder >= 128) {
    out.push((remainder % 128) + 128);
    remainder = Math.floor(remainder / 128);
  }
  out.push(remainder);
  return out;
}
