function key_slot(key) {
  const start = key.indexOf("{");
  if (start !== -1) {
    const end = key.indexOf("}", start + 1);
    if (end !== -1 && end > start + 1) {
      key = key.slice(start + 1, end);
    }
  }

  let crc = 0;
  for (let i = 0; i < key.length; i++) {
    const byte = key.charCodeAt(i);
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc % 16384;
}
