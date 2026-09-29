function dfs_order(n, adj, start) {
  const order = [];
  const visited = new Array(n).fill(false);
  const stack = [start];
  while (stack.length > 0) {
    const u = stack.pop();
    if (visited[u]) continue;
    visited[u] = true;
    order.push(u);
    for (let i = adj[u].length - 1; i >= 0; i--) {
      stack.push(adj[u][i]);
    }
  }
  return order;
}
