// Parse a sequence of HTTP/2 frame headers from hex-encoded bytes.

const TYPE_NAMES = {
  0: "DATA",
  1: "HEADERS",
  2: "PRIORITY",
  3: "RST_STREAM",
  4: "SETTINGS",
  5: "PUSH_PROMISE",
  6: "PING",
  7: "GOAWAY",
  8: "WINDOW_UPDATE",
  9: "CONTINUATION",
};

function hexToBytes(hexStr) {
  const bytes = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes.push(parseInt(hexStr.slice(i, i + 2), 16));
  }
  return bytes;
}

function parse_h2_frames(hex_str) {
  const b = hexToBytes(hex_str);
  const frames = [];
  let pos = 0;
  const n = b.length;
  while (pos + 9 <= n) {
    const length = (b[pos] << 16) | (b[pos + 1] << 8) | b[pos + 2];
    const frameType = b[pos + 3];
    const flags = b[pos + 4];
    const streamId =
      ((b[pos + 5] * 16777216 +
        b[pos + 6] * 65536 +
        b[pos + 7] * 256 +
        b[pos + 8]) >>>
        0) &
      0x7fffffff;
    if (pos + 9 + length > n) break;
    const typeName = TYPE_NAMES[frameType] !== undefined ? TYPE_NAMES[frameType] : "UNKNOWN";
    frames.push([typeName, flags, streamId, length]);
    pos += 9 + length;
  }
  return frames;
}
