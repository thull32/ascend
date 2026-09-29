function bellman_ford(n, edges, src) {
  const dist = new Array(n).fill(Infinity);
  dist[src] = 0;

  for (let i = 0; i < n - 1; i++) {
    let changed = false;
    for (const [u, v, w] of edges) {
      if (dist[u] !== Infinity && dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const [u, v, w] of edges) {
    if (dist[u] !== Infinity && dist[u] + w < dist[v]) {
      return { dist: [], negativeCycle: true };
    }
  }

  return {
    dist: dist.map((d) => (d === Infinity ? null : d)),
    negativeCycle: false,
  };
}
