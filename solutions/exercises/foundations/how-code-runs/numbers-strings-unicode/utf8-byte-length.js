function utf8_length(s) {
  let total = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) {
      total += 1;
    } else if (cp < 0x800) {
      total += 2;
    } else if (cp < 0x10000) {
      total += 3;
    } else {
      total += 4;
    }
  }
  return total;
}
