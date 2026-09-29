function find_path(n, adj, s, t) {
  const visited = new Array(n).fill(false);
  const path = [];

  function go(u) {
    visited[u] = true;
    path.push(u);
    if (u === t) return true;
    for (const v of adj[u]) {
      if (!visited[v] && go(v)) return true;
    }
    path.pop();
    return false;
  }

  return go(s) ? path : [];
}
