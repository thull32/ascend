// BFS over words, connecting words that share a wildcard pattern (one
// letter blanked out) via buckets, so each transformation step is a bucket lookup.
function ladder_length(begin_word, end_word, word_list) {
  if (!word_list.includes(end_word)) return 0;
  const L = begin_word.length;
  const buckets = new Map();
  for (const w of word_list) {
    for (let i = 0; i < L; i++) {
      const pattern = w.slice(0, i) + "*" + w.slice(i + 1);
      if (!buckets.has(pattern)) buckets.set(pattern, []);
      buckets.get(pattern).push(w);
    }
  }

  const seen = new Set([begin_word]);
  let queue = [begin_word];
  let level = 1;
  while (queue.length) {
    const next = [];
    for (const word of queue) {
      for (let i = 0; i < L; i++) {
        const pattern = word.slice(0, i) + "*" + word.slice(i + 1);
        const bucket = buckets.get(pattern);
        if (!bucket) continue;
        buckets.delete(pattern); // use each bucket once
        for (const nxt of bucket) {
          if (nxt === end_word) return level + 1;
          if (!seen.has(nxt)) {
            seen.add(nxt);
            next.push(nxt);
          }
        }
      }
    }
    queue = next;
    level += 1;
  }
  return 0;
}
