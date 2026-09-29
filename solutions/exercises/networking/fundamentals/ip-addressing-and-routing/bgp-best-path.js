const ORIGIN_RANK = { igp: 0, egp: 1, incomplete: 2 };

function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  let value = 0;
  for (const p of parts) value = value * 256 + p;
  return value;
}

function bgp_best_path(routes) {
  let candidates = routes.slice();

  // 1. highest local_pref
  let best = Math.max(...candidates.map((c) => c.local_pref));
  candidates = candidates.filter((c) => c.local_pref === best);

  // 2. shortest as_path
  best = Math.min(...candidates.map((c) => c.as_path.length));
  candidates = candidates.filter((c) => c.as_path.length === best);

  // 3. best origin
  best = Math.min(...candidates.map((c) => ORIGIN_RANK[c.origin]));
  candidates = candidates.filter((c) => ORIGIN_RANK[c.origin] === best);

  // 4. MED, compared only within the same neighbouring AS (as_path[0])
  const medByNeighbor = new Map();
  for (const c of candidates) {
    const neighbor = c.as_path[0];
    const current = medByNeighbor.has(neighbor)
      ? medByNeighbor.get(neighbor)
      : c.med;
    medByNeighbor.set(neighbor, Math.min(current, c.med));
  }
  candidates = candidates.filter(
    (c) => c.med === medByNeighbor.get(c.as_path[0])
  );

  // 5. eBGP over iBGP
  if (candidates.some((c) => c.ebgp)) {
    candidates = candidates.filter((c) => c.ebgp);
  }

  // 6. lowest igp_cost
  best = Math.min(...candidates.map((c) => c.igp_cost));
  candidates = candidates.filter((c) => c.igp_cost === best);

  // 7. lowest router_id, compared numerically
  best = Math.min(...candidates.map((c) => ipToInt(c.router_id)));
  candidates = candidates.filter((c) => ipToInt(c.router_id) === best);

  return candidates[0].id;
}
