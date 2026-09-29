function max_matching(n_left, n_right, edges) {
  const adj = Array.from({ length: n_left }, () => []);
  for (const [u, v] of edges) adj[u].push(v);
  const matchRight = new Array(n_right).fill(-1);

  function tryAssign(u, seen) {
    for (const v of adj[u]) {
      if (seen.has(v)) continue;
      seen.add(v);
      if (matchRight[v] === -1 || tryAssign(matchRight[v], seen)) {
        matchRight[v] = u;
        return true;
      }
    }
    return false;
  }

  let result = 0;
  for (let u = 0; u < n_left; u++) {
    if (tryAssign(u, new Set())) result++;
  }
  return result;
}
