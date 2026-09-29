// Encode a single, final WebSocket frame as lowercase hex.

function hexToBytes(hexStr) {
  const bytes = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes.push(parseInt(hexStr.slice(i, i + 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ws_frame(opcode, payload_hex, mask_hex) {
  const payload = hexToBytes(payload_hex);
  const mask = hexToBytes(mask_hex);
  const masked = mask.length === 4;

  const out = [];
  out.push(0x80 | opcode);

  const length = payload.length;
  const maskBit = masked ? 0x80 : 0x00;
  if (length < 126) {
    out.push(maskBit | length);
  } else if (length < 65536) {
    out.push(maskBit | 126);
    out.push((length >> 8) & 0xff, length & 0xff);
  } else {
    out.push(maskBit | 127);
    // 8-byte big-endian length; lengths here fit comfortably below 2^53.
    for (let shift = 7; shift >= 0; shift--) {
      out.push(Math.floor(length / 256 ** shift) % 256);
    }
  }

  if (masked) {
    for (const b of mask) out.push(b);
    for (let i = 0; i < payload.length; i++) {
      out.push(payload[i] ^ mask[i % 4]);
    }
  } else {
    for (const b of payload) out.push(b);
  }

  return bytesToHex(out);
}
