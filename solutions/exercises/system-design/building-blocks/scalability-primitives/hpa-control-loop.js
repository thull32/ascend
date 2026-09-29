function autoscale(start, target_pct, demand, min_replicas, max_replicas, window) {
  let current = start;
  const recs = new Array(window - 1).fill(start);
  const out = [];
  for (const d of demand) {
    const util = Math.min(d, 100 * current);
    const targetAtCurrent = target_pct * current;
    let rec;
    if (Math.abs(util - targetAtCurrent) * 10 <= targetAtCurrent) {
      rec = current;
    } else {
      rec = Math.ceil(util / target_pct);
    }
    rec = Math.max(min_replicas, Math.min(max_replicas, rec));
    recs.push(rec);
    if (rec > current) {
      current = Math.min(rec, Math.max(2 * current, current + 4));
    } else {
      current = Math.min(current, Math.max(...recs.slice(-window)));
    }
    out.push(current);
  }
  return out;
}
