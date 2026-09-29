function top_p_filter(probs, p) {
  const n = probs.length;
  const order = [...Array(n).keys()].sort((a, b) => {
    if (probs[b] !== probs[a]) return probs[b] - probs[a];
    return a - b;
  });

  const kept = [];
  let cum = 0;
  for (const i of order) {
    kept.push(i);
    cum += probs[i];
    if (cum >= p) break;
  }

  const total = kept.reduce((acc, i) => acc + probs[i], 0);
  const result = new Array(n).fill(0);
  for (const i of kept) {
    result[i] = probs[i] / total;
  }
  return result;
}
