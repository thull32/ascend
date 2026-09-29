function strongly_connected_components(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) adj[u].push(v);

  const disc = new Array(n).fill(-1);
  const low = new Array(n).fill(0);
  const onStack = new Array(n).fill(false);
  const stack = [];
  let counter = 0;
  const result = [];

  function dfs(u) {
    disc[u] = low[u] = counter++;
    stack.push(u);
    onStack[u] = true;
    for (const v of adj[u]) {
      if (disc[v] === -1) {
        dfs(v);
        low[u] = Math.min(low[u], low[v]);
      } else if (onStack[v]) {
        low[u] = Math.min(low[u], disc[v]);
      }
    }
    if (low[u] === disc[u]) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        comp.push(w);
      } while (w !== u);
      comp.sort((a, b) => a - b);
      result.push(comp);
    }
  }

  for (let i = 0; i < n; i++) {
    if (disc[i] === -1) dfs(i);
  }

  result.sort((a, b) => a[0] - b[0]);
  return result;
}
