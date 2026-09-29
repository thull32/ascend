function apply_frames(last_seq, frames) {
  let upto = last_seq;
  const buffer = new Set();
  const rendered = [];
  let duplicates = 0;

  for (const seq of frames) {
    if (seq <= upto || buffer.has(seq)) {
      duplicates += 1;
      continue;
    }
    buffer.add(seq);
    while (buffer.has(upto + 1)) {
      upto += 1;
      buffer.delete(upto);
      rendered.push(upto);
    }
  }

  let gaps = [];
  if (buffer.size > 0) {
    const highestBuffered = Math.max(...buffer);
    for (let s = upto + 1; s <= highestBuffered; s++) {
      if (!buffer.has(s)) gaps.push(s);
    }
  }

  return { rendered, gaps, duplicates };
}
