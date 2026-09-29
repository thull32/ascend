function availability(node) {
  if (typeof node === "number") return node;

  if (node.serial !== undefined) {
    let a = 1.0;
    for (const child of node.serial) a *= availability(child);
    return a;
  }

  if (node.parallel !== undefined) {
    let unavail = 1.0;
    for (const child of node.parallel) unavail *= (1 - availability(child));
    return 1 - unavail;
  }

  // k-of-n
  const k = node.k;
  const avails = node.of.map(availability);
  const n = avails.length;
  if (k > n) return 0.0;

  let dist = new Array(n + 1).fill(0.0);
  dist[0] = 1.0;
  for (const a of avails) {
    const newDist = new Array(n + 1).fill(0.0);
    for (let j = 0; j <= n; j++) {
      const p = dist[j];
      if (p === 0) continue;
      newDist[j] += p * (1 - a);
      if (j + 1 <= n) newDist[j + 1] += p * a;
    }
    dist = newDist;
  }

  let total = 0.0;
  for (let j = k; j <= n; j++) total += dist[j];
  return total;
}

function downtime_seconds(node) {
  const a = availability(node);
  return Math.floor((1 - a) * 2592000 + 0.5);
}
