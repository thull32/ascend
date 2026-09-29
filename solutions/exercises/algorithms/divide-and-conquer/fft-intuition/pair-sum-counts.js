function pair_sum_counts(a, b) {
  if (a.length === 0 || b.length === 0) return [];
  const histA = new Array(Math.max(...a) + 1).fill(0);
  for (const x of a) histA[x]++;
  const histB = new Array(Math.max(...b) + 1).fill(0);
  for (const x of b) histB[x]++;

  const result = new Array(histA.length + histB.length - 1).fill(0);
  for (let i = 0; i < histA.length; i++) {
    if (histA[i] === 0) continue;
    for (let j = 0; j < histB.length; j++) {
      result[i + j] += histA[i] * histB[j];
    }
  }
  return result;
}
