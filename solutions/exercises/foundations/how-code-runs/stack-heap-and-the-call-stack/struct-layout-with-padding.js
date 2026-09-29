function struct_size(fields) {
  let offset = 0;
  let maxSize = 1;
  for (const f of fields) {
    if (f > maxSize) maxSize = f;
    if (offset % f !== 0) {
      offset += f - (offset % f);
    }
    offset += f;
  }
  if (offset % maxSize !== 0) {
    offset += maxSize - (offset % maxSize);
  }
  return offset;
}
