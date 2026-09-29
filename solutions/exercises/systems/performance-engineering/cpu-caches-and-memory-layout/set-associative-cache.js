function cache_hits(addresses, line_size, num_sets, ways) {
  const sets = Array.from({ length: num_sets }, () => []);
  let hits = 0;
  for (const addr of addresses) {
    const line = Math.floor(addr / line_size);
    const entries = sets[line % num_sets];
    const idx = entries.indexOf(line);
    if (idx !== -1) {
      hits += 1;
      entries.splice(idx, 1);
      entries.push(line);
    } else {
      if (entries.length >= ways) entries.shift();
      entries.push(line);
    }
  }
  return hits;
}
