// SPF over an IS-IS link-state database: two-way check, overload bit, ECMP next hops.

function spf_next_hops(lsps, source) {
  const usable = (u, v) => v in lsps && u in lsps[v].neighbors;
  const dist = { [source]: 0 };
  const hops = { [source]: new Set() };
  const done = new Set();
  // The graphs are small, so a linear scan for the closest unfinished router is enough.
  while (true) {
    let u = null;
    for (const n of Object.keys(dist)) {
      if (!done.has(n) && (u === null || dist[n] < dist[u])) u = n;
    }
    if (u === null) break;
    done.add(u);
    if (u !== source && lsps[u].overload) continue; // reachable itself, but never transit
    for (const [v, metric] of Object.entries(lsps[u].neighbors)) {
      if (!usable(u, v)) continue;
      const nd = dist[u] + metric;
      const first = u === source ? [v] : [...hops[u]];
      if (!(v in dist) || nd < dist[v]) {
        dist[v] = nd;
        hops[v] = new Set(first);
      } else if (nd === dist[v]) {
        for (const h of first) hops[v].add(h);
      }
    }
  }

  const local = new Set(Object.keys(lsps[source].prefixes));
  const routes = {};
  for (const node of done) {
    if (node === source) continue;
    for (const [prefix, pmetric] of Object.entries(lsps[node].prefixes)) {
      if (local.has(prefix)) continue;
      const total = dist[node] + pmetric;
      const best = routes[prefix];
      if (best === undefined || total < best[0]) {
        routes[prefix] = [total, new Set(hops[node])];
      } else if (total === best[0]) {
        for (const h of hops[node]) best[1].add(h);
      }
    }
  }
  const out = {};
  for (const [p, [m, h]] of Object.entries(routes)) out[p] = { metric: m, next_hops: [...h].sort() };
  return out;
}
