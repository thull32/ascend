function roc_auc(labels, scores) {
  const pos = [];
  const neg = [];
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === 1) pos.push(scores[i]);
    else neg.push(scores[i]);
  }
  if (pos.length === 0 || neg.length === 0) return null;

  let total = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) total += 1;
      else if (p === n) total += 0.5;
    }
  }
  return total / (pos.length * neg.length);
}
