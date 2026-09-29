function internet_checksum(data) {
  let total = 0;
  for (let i = 0; i < data.length; i += 2) {
    const hi = data[i];
    const lo = i + 1 < data.length ? data[i + 1] : 0;
    total += (hi << 8) | lo;
    total = (total & 0xffff) + (total >>> 16);
  }
  return (~total) & 0xffff;
}
