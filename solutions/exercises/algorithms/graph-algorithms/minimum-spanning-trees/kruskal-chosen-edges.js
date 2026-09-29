function kruskal_edges(n, edges) {
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  const order = edges.map((_, i) => i).sort((a, b) => edges[a][2] - edges[b][2] || a - b);
  const chosen = [];
  for (const i of order) {
    const [u, v] = edges[i];
    const ru = find(u), rv = find(v);
    if (ru !== rv) {
      parent[ru] = rv;
      chosen.push(i);
    }
  }
  return chosen;
}
