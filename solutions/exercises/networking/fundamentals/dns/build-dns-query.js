function build_dns_query(txid, name, qtype) {
  const bytes = [
    (txid >> 8) & 0xff,
    txid & 0xff,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ];

  const labels = name.split(".").filter((label) => label !== "");
  for (const label of labels) {
    bytes.push(label.length);
    for (let i = 0; i < label.length; i++) {
      bytes.push(label.charCodeAt(i));
    }
  }
  bytes.push(0x00);

  bytes.push((qtype >> 8) & 0xff, qtype & 0xff, 0x00, 0x01);

  return bytes
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
