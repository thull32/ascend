function earliest_full_connection(n, logs) {
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  let components = n;
  const sorted = [...logs].sort((a, b) => a[0] - b[0]);
  for (const [t, u, v] of sorted) {
    const ru = find(u), rv = find(v);
    if (ru !== rv) {
      parent[ru] = rv;
      components--;
      if (components === 1) return t;
    }
  }
  return -1;
}
