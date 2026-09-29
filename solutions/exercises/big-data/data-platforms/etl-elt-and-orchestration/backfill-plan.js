function backfill_plan(deps, changed) {
  const downstream = new Map();
  for (const t of Object.keys(deps)) if (!downstream.has(t)) downstream.set(t, []);
  for (const [t, ups] of Object.entries(deps)) {
    for (const u of ups) {
      if (!downstream.has(u)) downstream.set(u, []);
      downstream.get(u).push(t);
    }
  }

  const rerun = new Set();
  const stack = [...changed];
  while (stack.length > 0) {
    const t = stack.pop();
    if (rerun.has(t)) continue;
    rerun.add(t);
    for (const d of downstream.get(t) || []) {
      if (!rerun.has(d)) stack.push(d);
    }
  }

  const indegree = new Map();
  for (const t of rerun) indegree.set(t, 0);
  for (const t of rerun) {
    for (const u of deps[t] || []) {
      if (rerun.has(u)) indegree.set(t, indegree.get(t) + 1);
    }
  }

  let ready = [...rerun].filter((t) => indegree.get(t) === 0).sort();
  const result = [];
  while (ready.length > 0) {
    const t = ready.shift();
    result.push(t);
    for (const d of downstream.get(t) || []) {
      if (rerun.has(d)) {
        indegree.set(d, indegree.get(d) - 1);
        if (indegree.get(d) === 0) {
          let i = 0;
          while (i < ready.length && ready[i] < d) i++;
          ready.splice(i, 0, d);
        }
      }
    }
  }
  return result;
}
