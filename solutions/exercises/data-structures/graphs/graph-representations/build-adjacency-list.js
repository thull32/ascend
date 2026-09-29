function adjacency_list(n, edges, directed) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    adj[u].push(v);
    if (!directed) adj[v].push(u);
  }
  for (const neighbours of adj) {
    neighbours.sort((a, b) => a - b);
  }
  return adj;
}
