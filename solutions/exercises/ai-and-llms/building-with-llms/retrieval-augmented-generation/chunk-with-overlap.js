function chunk_text(text, size, overlap) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  if (words.length === 0) return chunks;

  const stride = size - overlap;
  const n = words.length;
  let start = 0;
  while (true) {
    const end = Math.min(start + size, n);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= n) break;
    start += stride;
  }
  return chunks;
}
