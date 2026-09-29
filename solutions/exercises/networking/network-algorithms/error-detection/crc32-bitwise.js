function crc32(s) {
  let crc = 0xffffffff;
  for (let i = 0; i < s.length; i++) {
    const byte = s.charCodeAt(i);
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
