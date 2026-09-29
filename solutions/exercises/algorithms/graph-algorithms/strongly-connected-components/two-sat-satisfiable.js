function two_sat(n, clauses) {
  const size = 2 * n;

  function idx(lit) {
    return 2 * (Math.abs(lit) - 1) + (lit < 0 ? 1 : 0);
  }

  const adj = Array.from({ length: size }, () => []);
  for (const [a, b] of clauses) {
    adj[idx(-a)].push(idx(b));
    adj[idx(-b)].push(idx(a));
  }

  const disc = new Array(size).fill(-1);
  const low = new Array(size).fill(0);
  const onStack = new Array(size).fill(false);
  const stack = [];
  let counter = 0;
  const comp = new Array(size).fill(-1);
  let compCounter = 0;

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
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        comp[w] = compCounter;
      } while (w !== u);
      compCounter++;
    }
  }

  for (let i = 0; i < size; i++) {
    if (disc[i] === -1) dfs(i);
  }

  for (let i = 1; i <= n; i++) {
    if (comp[idx(i)] === comp[idx(-i)]) return false;
  }
  return true;
}
