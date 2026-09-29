function has_cycle_directed(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    adj[u].push(v);
  }

  const colour = new Array(n).fill(0); // 0 = white, 1 = grey, 2 = black

  function dfs(u) {
    colour[u] = 1;
    for (const v of adj[u]) {
      if (colour[v] === 1) return true;
      if (colour[v] === 0 && dfs(v)) return true;
    }
    colour[u] = 2;
    return false;
  }

  for (let start = 0; start < n; start++) {
    if (colour[start] === 0 && dfs(start)) return true;
  }
  return false;
}
