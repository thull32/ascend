function longest_path_dag(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  const indegree = new Array(n).fill(0);
  for (const [u, v] of edges) {
    adj[u].push(v);
    indegree[v]++;
  }

  const queue = [];
  for (let v = 0; v < n; v++) {
    if (indegree[v] === 0) queue.push(v);
  }
  const order = [];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    order.push(u);
    for (const v of adj[u]) {
      indegree[v]--;
      if (indegree[v] === 0) queue.push(v);
    }
  }

  if (order.length !== n) return -1;

  const best = new Array(n).fill(0);
  for (const u of order) {
    for (const v of adj[u]) {
      if (best[u] + 1 > best[v]) best[v] = best[u] + 1;
    }
  }

  return n > 0 ? Math.max(...best) : 0;
}
