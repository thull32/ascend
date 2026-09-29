const TYPE_NAMES = { 1: "A", 2: "NS", 5: "CNAME", 6: "SOA" };

function parse_dns_response(hex_str) {
  const b = [];
  for (let i = 0; i < hex_str.length; i += 2) b.push(parseInt(hex_str.slice(i, i + 2), 16));

  const txid = (b[0] << 8) | b[1];
  const flags = (b[2] << 8) | b[3];
  const rcode = flags & 0x0f;
  const qdcount = (b[4] << 8) | b[5];
  const ancount = (b[6] << 8) | b[7];
  const nscount = (b[8] << 8) | b[9];

  function readName(offset) {
    const labels = [];
    let pos = offset;
    let endOffset = null;
    while (true) {
      const length = b[pos];
      if (length === 0) {
        pos += 1;
        if (endOffset === null) endOffset = pos;
        break;
      }
      if ((length & 0xc0) === 0xc0) {
        const pointer = ((length & 0x3f) << 8) | b[pos + 1];
        if (endOffset === null) endOffset = pos + 2;
        pos = pointer;
        continue;
      }
      let label = "";
      for (let i = 0; i < length; i++) label += String.fromCharCode(b[pos + 1 + i]);
      labels.push(label);
      pos += 1 + length;
    }
    const name = labels.length > 0 ? labels.join(".") + "." : ".";
    return [name, endOffset];
  }

  function toHex(bytes, start, end) {
    let s = "";
    for (let i = start; i < end; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }

  function u32(pos) {
    return b[pos] * 2 ** 24 + b[pos + 1] * 2 ** 16 + b[pos + 2] * 2 ** 8 + b[pos + 3];
  }

  let offset = 12;
  for (let i = 0; i < qdcount; i++) {
    const [, next] = readName(offset);
    offset = next + 4; // QTYPE + QCLASS
  }

  function readRecord(offset) {
    let name;
    [name, offset] = readName(offset);
    const rtype = (b[offset] << 8) | b[offset + 1];
    offset += 2;
    offset += 2; // class
    const ttl = u32(offset);
    offset += 4;
    const rdlength = (b[offset] << 8) | b[offset + 1];
    offset += 2;
    const rdataStart = offset;
    const rdataEnd = offset + rdlength;

    let data;
    if (rtype === 1) {
      data = b.slice(rdataStart, rdataEnd).join(".");
    } else if (rtype === 2 || rtype === 5) {
      [data] = readName(rdataStart);
    } else if (rtype === 6) {
      let mname, rname, pos;
      [mname, pos] = readName(rdataStart);
      [rname, pos] = readName(pos);
      const serial = u32(pos);
      const refresh = u32(pos + 4);
      const retry = u32(pos + 8);
      const expire = u32(pos + 12);
      const minimum = u32(pos + 16);
      data = `${mname} ${rname} ${serial} ${refresh} ${retry} ${expire} ${minimum}`;
    } else {
      data = toHex(b, rdataStart, rdataEnd);
    }

    const typeName = TYPE_NAMES[rtype] || `TYPE${rtype}`;
    return [[name, typeName, ttl, data], rdataEnd];
  }

  const answers = [];
  for (let i = 0; i < ancount; i++) {
    let record;
    [record, offset] = readRecord(offset);
    answers.push(record);
  }

  const authority = [];
  for (let i = 0; i < nscount; i++) {
    let record;
    [record, offset] = readRecord(offset);
    authority.push(record);
  }

  return { id: txid, rcode, answers, authority };
}
