function simulate(initial, events, use_leases) {
  let db = initial;
  let cache = null;
  const local = new Map();
  let leases = new Set();

  for (const ev of events) {
    const kind = ev[0];
    if (kind === "miss") {
      const r = ev[1];
      local.set(r, db);
      if (use_leases) leases.add(r);
    } else if (kind === "fill") {
      const r = ev[1];
      if (use_leases) {
        if (leases.has(r)) cache = local.get(r);
        leases.delete(r);
      } else {
        cache = local.get(r);
      }
    } else if (kind === "write") {
      db = ev[1];
    } else if (kind === "invalidate") {
      cache = null;
      if (use_leases) leases = new Set();
    }
  }

  const stale = cache !== null && cache !== db;
  return { db, cache, stale };
}
