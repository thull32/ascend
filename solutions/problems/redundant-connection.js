// Redundant Connection: union-find; the first edge joining an already-connected
// pair is the answer.
function find_redundant_connection(edges) {
  const n = edges.length;
  const parent = new Array(n + 1);
  const size = new Array(n + 1).fill(1);
  for (let i = 0; i <= n; i++) parent[i] = i;

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path halving
      x = parent[x];
    }
    return x;
  }

  for (const [a, b] of edges) {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) {
      return [a, b];
    }
    if (size[ra] < size[rb]) {
      [ra, rb] = [rb, ra];
    }
    parent[rb] = ra;
    size[ra] += size[rb];
  }
  return [];
}
