function hamt_slot(bitmap, chunk) {
  const present = ((bitmap >>> chunk) & 1) === 1;
  const mask = (2 ** chunk - 1) >>> 0;
  let bits = (bitmap & mask) >>> 0;
  let index = 0;
  while (bits !== 0) {
    bits &= bits - 1;
    index += 1;
  }
  return [present, index];
}
