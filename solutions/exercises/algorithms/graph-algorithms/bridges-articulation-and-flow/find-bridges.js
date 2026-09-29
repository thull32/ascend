function find_bridges(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  edges.forEach(([u, v], i) => {
    adj[u].push([v, i]);
    adj[v].push([u, i]);
  });

  const disc = new Array(n).fill(-1);
  const low = new Array(n).fill(0);
  let counter = 0;
  const bridges = [];

  function dfs(u, parentEdge) {
    disc[u] = low[u] = counter++;
    for (const [v, ei] of adj[u]) {
      if (ei === parentEdge) continue;
      if (disc[v] === -1) {
        dfs(v, ei);
        low[u] = Math.min(low[u], low[v]);
        if (low[v] > disc[u]) {
          bridges.push([Math.min(u, v), Math.max(u, v)]);
        }
      } else {
        low[u] = Math.min(low[u], disc[v]);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (disc[i] === -1) dfs(i, -1);
  }

  bridges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return bridges;
}
