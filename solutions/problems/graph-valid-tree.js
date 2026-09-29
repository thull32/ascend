// A tree on n nodes has exactly n-1 edges and is connected; check the edge
// count, then verify connectivity with a DFS from node 0.
function valid_tree(n, edges) {
  if (edges.length !== n - 1) return false;
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const u = stack.pop();
    for (const v of adj[u]) {
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return seen.size === n;
}
