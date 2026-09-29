// Union-find by size: start with n components, merge one away per edge that
// actually joins two different components.
function count_components(n, edges) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const size = new Array(n).fill(1);

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path halving
      x = parent[x];
    }
    return x;
  }

  let components = n;
  for (const [a, b] of edges) {
    let ra = find(a), rb = find(b);
    if (ra === rb) continue; // edge inside a component
    if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
    parent[rb] = ra; // union by size
    size[ra] += size[rb];
    components -= 1;
  }
  return components;
}
