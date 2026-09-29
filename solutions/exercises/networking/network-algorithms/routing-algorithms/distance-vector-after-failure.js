function dv_after_failure(n, edges, dest, failed, split_horizon, infinity) {
  function buildAdj(edgeList) {
    const adj = [];
    for (let i = 0; i < n; i++) adj.push([]);
    for (const [u, v, c] of edgeList) {
      adj[u].push([v, c]);
      adj[v].push([u, c]);
    }
    for (const list of adj) list.sort((a, b) => a[0] - b[0]);
    return adj;
  }

  function runRound(adj, distPrev, hopPrev) {
    const dist = distPrev.slice();
    const hop = hopPrev.slice();
    for (let x = 0; x < n; x++) {
      if (x === dest) continue;
      let bestDist = infinity;
      let bestHop = null;
      for (const [y, c] of adj[x]) {
        let adv;
        if (split_horizon && hopPrev[y] === x) adv = infinity;
        else adv = distPrev[y];
        const cand = Math.min(c + adv, infinity);
        if (cand < bestDist) {
          bestDist = cand;
          bestHop = y;
        }
      }
      dist[x] = bestDist;
      hop[x] = bestHop;
    }
    return [dist, hop];
  }

  function sameArr(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function converge(adj, dist, hop) {
    const rounds = [];
    while (true) {
      const [newDist, newHop] = runRound(adj, dist, hop);
      if (sameArr(newDist, dist) && sameArr(newHop, hop)) return [dist, hop, rounds];
      dist = newDist;
      hop = newHop;
      rounds.push(dist.slice());
    }
  }

  function removeEdge(edgeList, failedPair) {
    const [fu, fv] = failedPair;
    const out = [];
    let removed = false;
    for (const e of edgeList) {
      const setMatch = (e[0] === fu && e[1] === fv) || (e[0] === fv && e[1] === fu);
      if (!removed && setMatch) {
        removed = true;
        continue;
      }
      out.push(e);
    }
    return out;
  }

  const dist0 = new Array(n).fill(infinity);
  dist0[dest] = 0;
  const hop0 = new Array(n).fill(null);

  const adjFull = buildAdj(edges);
  const [dist1, hop1] = converge(adjFull, dist0, hop0);

  const adj2 = buildAdj(removeEdge(edges, failed));
  const [, , rounds2] = converge(adj2, dist1, hop1);
  return rounds2;
}
