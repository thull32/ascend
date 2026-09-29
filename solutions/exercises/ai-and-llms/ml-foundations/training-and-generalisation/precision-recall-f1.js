function precision_recall_f1(y_true, y_pred) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < y_true.length; i++) {
    const t = y_true[i];
    const p = y_pred[i];
    if (t === 1 && p === 1) tp += 1;
    else if (t === 0 && p === 1) fp += 1;
    else if (t === 1 && p === 0) fn += 1;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return [precision, recall, f1];
}
