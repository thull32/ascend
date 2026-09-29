function topo_order(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  const indegree = new Array(n).fill(0);
  for (const [u, v] of edges) {
    adj[u].push(v);
    indegree[v]++;
  }

  const ready = [];
  for (let v = 0; v < n; v++) {
    if (indegree[v] === 0) ready.push(v);
  }

  const order = [];
  while (ready.length > 0) {
    ready.sort((a, b) => a - b);
    const u = ready.shift();
    order.push(u);
    for (const v of adj[u]) {
      indegree[v]--;
      if (indegree[v] === 0) ready.push(v);
    }
  }

  return order.length === n ? order : [];
}
