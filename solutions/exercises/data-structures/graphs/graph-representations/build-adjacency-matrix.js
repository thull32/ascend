function adjacency_matrix(n, edges, directed) {
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const [u, v] of edges) {
    m[u][v] = 1;
    if (!directed) m[v][u] = 1;
  }
  return m;
}
