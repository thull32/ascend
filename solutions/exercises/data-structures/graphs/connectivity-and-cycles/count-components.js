function count_components(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    adj[u].push(v);
    adj[v].push(u);
  }

  const visited = new Array(n).fill(false);
  let count = 0;
  for (let start = 0; start < n; start++) {
    if (visited[start]) continue;
    count++;
    const stack = [start];
    visited[start] = true;
    while (stack.length > 0) {
      const u = stack.pop();
      for (const v of adj[u]) {
        if (!visited[v]) {
          visited[v] = true;
          stack.push(v);
        }
      }
    }
  }
  return count;
}
