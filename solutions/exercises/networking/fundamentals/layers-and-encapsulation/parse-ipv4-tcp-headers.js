function parse_tcp_packet(hex_str) {
  const h = hex_str.replace(/\s+/g, "");
  const b = [];
  for (let i = 0; i < h.length; i += 2) b.push(parseInt(h.slice(i, i + 2), 16));

  const ihl = (b[0] & 0x0f) * 4;
  const total_length = (b[2] << 8) | b[3];
  const flagsByte = b[6];
  const df = (flagsByte & 0x40) !== 0;
  const ttl = b[8];
  const src = b.slice(12, 16).join(".");
  const dst = b.slice(16, 20).join(".");

  const tcp = b.slice(ihl);
  const sport = (tcp[0] << 8) | tcp[1];
  const dport = (tcp[2] << 8) | tcp[3];
  const seq =
    tcp[4] * 2 ** 24 + tcp[5] * 2 ** 16 + tcp[6] * 2 ** 8 + tcp[7];
  const ack =
    tcp[8] * 2 ** 24 + tcp[9] * 2 ** 16 + tcp[10] * 2 ** 8 + tcp[11];
  const dataOffset = (tcp[12] >> 4) * 4;
  const tcpFlagsByte = tcp[13];
  const window = (tcp[14] << 8) | tcp[15];

  const tcpHeaderLen = ihl + dataOffset;
  const payload_len = total_length - tcpHeaderLen;

  let letters = "";
  if (tcpFlagsByte & 0x01) letters += "F";
  if (tcpFlagsByte & 0x02) letters += "S";
  if (tcpFlagsByte & 0x04) letters += "R";
  if (tcpFlagsByte & 0x08) letters += "P";
  if (tcpFlagsByte & 0x20) letters += "U";
  if (tcpFlagsByte & 0x40) letters += "E";
  if (tcpFlagsByte & 0x80) letters += "W";
  if (tcpFlagsByte & 0x10) letters += ".";

  return {
    src,
    dst,
    ttl,
    df,
    sport,
    dport,
    seq,
    ack,
    window,
    payload_len,
    flags: letters,
  };
}
