function lsh_candidates(signatures, b, r) {
  const buckets = new Map();
  signatures.forEach((sig, docIdx) => {
    for (let band = 0; band < b; band++) {
      const slice = sig.slice(band * r, (band + 1) * r);
      const key = band + ":" + slice.join(",");
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(docIdx);
    }
  });

  const pairSet = new Set();
  const pairs = [];
  for (const docs of buckets.values()) {
    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const a = Math.min(docs[i], docs[j]);
        const c = Math.max(docs[i], docs[j]);
        const key = a + "," + c;
        if (!pairSet.has(key)) {
          pairSet.add(key);
          pairs.push([a, c]);
        }
      }
    }
  }

  pairs.sort((p, q) => (p[0] - q[0] !== 0 ? p[0] - q[0] : p[1] - q[1]));
  return pairs;
}
