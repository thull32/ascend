// Decode a BGP UPDATE: withdrawn prefixes, attribute type codes in order, announced prefixes.

function decode_update(msg) {
  function prefixes(start, end) {
    const out = [];
    let i = start;
    while (i < end) {
      const length = msg[i];
      const n = Math.ceil(length / 8);
      const octets = [];
      for (let k = 0; k < 4; k++) octets.push(k < n ? msg[i + 1 + k] : 0);
      out.push(octets.join(".") + "/" + length);
      i += 1 + n;
    }
    return out;
  }
  const total = (msg[16] << 8) | msg[17];
  const wlen = (msg[19] << 8) | msg[20];
  const withdrawn = prefixes(21, 21 + wlen);
  const a = 21 + wlen;
  const alen = (msg[a] << 8) | msg[a + 1];
  let i = a + 2;
  const end = a + 2 + alen;
  const codes = [];
  while (i < end) {
    const flags = msg[i];
    const code = msg[i + 1];
    let vlen, hdr;
    if (flags & 0x10) {
      vlen = (msg[i + 2] << 8) | msg[i + 3];
      hdr = 4;
    } else {
      vlen = msg[i + 2];
      hdr = 3;
    }
    codes.push(code);
    i += hdr + vlen;
  }
  return { withdrawn: withdrawn, attributes: codes, nlri: prefixes(end, total) };
}
