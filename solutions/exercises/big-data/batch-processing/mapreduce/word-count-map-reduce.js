function map_reduce_word_count(splits, num_reducers) {
  const partition = (word) => {
    let s = 0;
    for (const ch of word) s += ch.charCodeAt(0);
    return s % num_reducers;
  };

  let shuffled = 0;
  const reducerCounts = Array.from({ length: num_reducers }, () => new Map());

  for (const split of splits) {
    const words = split.split(/\s+/).filter((w) => w.length > 0);
    const combined = new Map();
    for (const w of words) combined.set(w, (combined.get(w) || 0) + 1);
    shuffled += combined.size;
    for (const [w, c] of combined) {
      const p = partition(w);
      reducerCounts[p].set(w, (reducerCounts[p].get(w) || 0) + c);
    }
  }

  const reducers = reducerCounts.map((rc) =>
    Array.from(rc.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([w, count]) => [w, count])
  );

  return { shuffled, reducers };
}
