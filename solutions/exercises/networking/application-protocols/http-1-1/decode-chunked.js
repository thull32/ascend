// Decode a chunked HTTP/1.1 body.

const HEX = new Set("0123456789abcdefABCDEF".split(""));

function decode_chunked(data) {
  let pos = 0;
  const body = [];
  const n = data.length;
  while (true) {
    const nl = data.indexOf("\r\n", pos);
    if (nl === -1) return { error: "incomplete" };
    const sizeLine = data.slice(pos, nl);
    const sizeText = sizeLine.split(";", 1)[0];
    if (sizeText.length === 0 || [...sizeText].some((c) => !HEX.has(c))) {
      return { error: "malformed" };
    }
    const size = parseInt(sizeText, 16);
    pos = nl + 2;
    if (size > 0) {
      if (pos + size + 2 > n) return { error: "incomplete" };
      const chunk = data.slice(pos, pos + size);
      if (data.slice(pos + size, pos + size + 2) !== "\r\n") {
        return { error: "malformed" };
      }
      body.push(chunk);
      pos = pos + size + 2;
    } else {
      while (true) {
        const nl2 = data.indexOf("\r\n", pos);
        if (nl2 === -1) return { error: "incomplete" };
        if (nl2 === pos) {
          pos = nl2 + 2;
          break;
        }
        pos = nl2 + 2;
      }
      return { body: body.join(""), consumed: pos };
    }
  }
}
