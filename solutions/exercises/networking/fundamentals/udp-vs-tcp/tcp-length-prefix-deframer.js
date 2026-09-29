function deframe(chunks) {
  const messages = [];
  let buf = [];

  function hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
    return bytes;
  }

  function bytesToHex(bytes) {
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  for (const chunkHex of chunks) {
    buf = buf.concat(hexToBytes(chunkHex));
    while (true) {
      if (buf.length < 2) break;
      const length = (buf[0] << 8) | buf[1];
      if (buf.length < 2 + length) break;
      const payload = buf.slice(2, 2 + length);
      messages.push(bytesToHex(payload));
      buf = buf.slice(2 + length);
    }
  }

  return messages;
}
