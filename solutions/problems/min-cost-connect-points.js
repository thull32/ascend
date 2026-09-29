// Min Cost to Connect All Points: array-based Prim's MST over Manhattan distance.
function min_cost_connect_points(points) {
  const n = points.length;
  const INF = Infinity;
  const best = new Array(n).fill(INF);
  best[0] = 0;
  const inTree = new Array(n).fill(false);
  let total = 0;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    for (let v = 0; v < n; v++) {
      if (!inTree[v] && (u === -1 || best[v] < best[u])) {
        u = v;
      }
    }
    inTree[u] = true;
    total += best[u];
    const [ux, uy] = points[u];
    for (let v = 0; v < n; v++) {
      if (!inTree[v]) {
        const d = Math.abs(ux - points[v][0]) + Math.abs(uy - points[v][1]);
        if (d < best[v]) {
          best[v] = d;
        }
      }
    }
  }
  return total;
}
