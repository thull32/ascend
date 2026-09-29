// Minimum Height Trees: peel leaves layer by layer (Kahn's algorithm) until 1 or 2 nodes remain.
function find_min_height_trees(n, edges) {
  if (n <= 2) {
    const result = [];
    for (let i = 0; i < n; i++) result.push(i);
    return result;
  }

  const adj = Array.from({ length: n }, () => []);
  const degree = new Array(n).fill(0);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
    degree[a] += 1;
    degree[b] += 1;
  }

  let layer = [];
  for (let v = 0; v < n; v++) {
    if (degree[v] === 1) layer.push(v);
  }

  let remaining = n;
  while (remaining > 2) {
    remaining -= layer.length;
    const next = [];
    for (const leaf of layer) {
      for (const nb of adj[leaf]) {
        degree[nb] -= 1;
        if (degree[nb] === 1) {
          next.push(nb);
        }
      }
    }
    layer = next;
  }
  return layer.slice().sort((a, b) => a - b);
}
