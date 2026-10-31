// Forwarding state for one destination is a functional graph: every router
// has at most one next hop. Walk from each router, marking the routers on the
// current walk; the walk ends at the destination, at a router with no next
// hop, at a router whose fate is already known, or back on its own path (a
// loop). Every router on the walk inherits the fate found at its end.
function routing_loop_detect(destination, next_hops) {
  const nxt = new Map();
  for (const [router, hop] of next_hops) nxt.set(router, hop);
  const routers = new Set(nxt.keys());
  for (const hop of nxt.values()) if (hop !== null) routers.add(hop);
  routers.delete(destination);

  const outcome = new Map([[destination, "delivered"]]);
  const cycles = [];
  for (const start of [...routers].sort()) {
    const path = [];
    const pos = new Map();
    let node = start;
    while (node !== null && !outcome.has(node) && !pos.has(node)) {
      pos.set(node, path.length);
      path.push(node);
      node = nxt.has(node) ? nxt.get(node) : null; // no entry means no route
    }
    let result;
    if (node === null) {
      result = "black_hole";
    } else if (pos.has(node)) {
      const cycle = path.slice(pos.get(node));
      let k = 0;
      for (let i = 1; i < cycle.length; i++) if (cycle[i] < cycle[k]) k = i;
      cycles.push([...cycle.slice(k), ...cycle.slice(0, k)]);
      result = "loop";
    } else {
      result = outcome.get(node);
    }
    for (const r of path) outcome.set(r, result);
  }

  cycles.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const sorted = [...routers].sort();
  return {
    cycles,
    looping: sorted.filter((r) => outcome.get(r) === "loop"),
    black_holed: sorted.filter((r) => outcome.get(r) === "black_hole"),
  };
}
