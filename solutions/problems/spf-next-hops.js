// SPF with ECMP first hops: Dijkstra over a binary heap, carrying for each
// router the set of source neighbours that start some shortest path to it.
const UNUSABLE = 16777215; // 2^24 - 1: the wide-metric "never use this link" value

function spf_next_hops(links, source) {
  // Adjacency map, keeping the lowest metric when an adjacency is listed twice.
  const adj = new Map();
  for (const [a, b, metric] of links) {
    if (metric >= UNUSABLE || a === b) continue;
    if (!adj.has(a)) adj.set(a, new Map());
    const nbrs = adj.get(a);
    if (!nbrs.has(b) || metric < nbrs.get(b)) nbrs.set(b, metric);
  }

  // Minimal binary heap of [distance, router].
  const heap = [];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  const dist = new Map([[source, 0]]);
  const hops = new Map([[source, new Set()]]);
  const done = new Set();
  push([0, source]);
  while (heap.length > 0) {
    const [d, u] = pop();
    if (done.has(u)) continue; // a stale heap entry
    done.add(u); // dist[u] and hops[u] are final now
    const out = adj.get(u);
    if (!out) continue;
    for (const [v, metric] of out) {
      const nd = d + metric;
      const via = u === source ? new Set([v]) : hops.get(u);
      if (!dist.has(v) || nd < dist.get(v)) {
        dist.set(v, nd); // strictly better: replace the set
        hops.set(v, new Set(via));
        push([nd, v]);
      } else if (nd === dist.get(v)) {
        const set = hops.get(v); // a tie: merge the first hops
        for (const h of via) set.add(h);
      }
    }
  }

  const result = {};
  for (const [v, d] of dist) {
    if (v === source) continue;
    result[v] = { cost: d, next_hops: [...hops.get(v)].sort() };
  }
  return result;
}
