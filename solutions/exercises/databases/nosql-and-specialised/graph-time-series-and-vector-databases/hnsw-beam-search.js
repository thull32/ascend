function beam_search(points, graph, entry, query, ef, k) {
  function keyOf(i) {
    const p = points[i];
    let dist = 0;
    for (let j = 0; j < query.length; j++) dist += (p[j] - query[j]) ** 2;
    return [dist, i];
  }

  function cmp(a, b) {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka[0] - kb[0] || ka[1] - kb[1];
  }

  function minOf(arr) {
    let m = arr[0];
    for (const x of arr) if (cmp(x, m) < 0) m = x;
    return m;
  }

  function maxOf(arr) {
    let m = arr[0];
    for (const x of arr) if (cmp(x, m) > 0) m = x;
    return m;
  }

  const visited = new Set([entry]);
  let candidates = [entry];
  let best = [entry];

  while (candidates.length) {
    const c = minOf(candidates);
    candidates = candidates.filter((x) => x !== c);

    let worst = maxOf(best);
    if (cmp(c, worst) > 0) break;

    for (const e of graph[c]) {
      if (visited.has(e)) continue;
      visited.add(e);
      worst = maxOf(best);
      if (best.length < ef || cmp(e, worst) < 0) {
        candidates.push(e);
        best.push(e);
        if (best.length > ef) {
          const drop = maxOf(best);
          best = best.filter((x) => x !== drop);
        }
      }
    }
  }

  best.sort(cmp);
  return best.slice(0, k);
}
