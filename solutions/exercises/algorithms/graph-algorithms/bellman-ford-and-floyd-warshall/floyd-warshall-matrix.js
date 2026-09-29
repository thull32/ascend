function floyd_warshall(n, edges) {
  const d = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) d[i][i] = 0;
  for (const [u, v, w] of edges) {
    if (w < d[u][v]) d[u][v] = w;
  }

  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      if (d[i][k] === Infinity) continue;
      for (let j = 0; j < n; j++) {
        const nd = d[i][k] + d[k][j];
        if (nd < d[i][j]) d[i][j] = nd;
      }
    }
  }

  return d.map((row) => row.map((x) => (x === Infinity ? null : x)));
}
