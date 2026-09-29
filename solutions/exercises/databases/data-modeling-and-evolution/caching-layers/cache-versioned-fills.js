function simulate_versioned(initial, events, mode) {
  let primaryValue = initial;
  let primaryVersion = 1;
  let replicaValue = initial;
  let replicaVersion = 1;
  let cache = null; // null, ["tombstone", version], or ["value", value, version]
  const local = new Map();

  for (const ev of events) {
    const kind = ev[0];
    if (kind === "write") {
      primaryValue = ev[1];
      primaryVersion += 1;
    } else if (kind === "replicate") {
      replicaValue = primaryValue;
      replicaVersion = primaryVersion;
    } else if (kind === "read") {
      local.set(ev[1], [primaryValue, primaryVersion]);
    } else if (kind === "read_replica") {
      local.set(ev[1], [replicaValue, replicaVersion]);
    } else if (kind === "invalidate") {
      cache = mode === "delete" ? null : ["tombstone", primaryVersion];
    } else if (kind === "fill") {
      const [value, version] = local.get(ev[1]);
      if (mode === "delete") {
        cache = ["value", value, version];
      } else {
        const allow =
          cache === null ||
          (cache[0] === "tombstone" && cache[1] <= version) ||
          (cache[0] === "value" && cache[2] < version);
        if (allow) cache = ["value", value, version];
      }
    }
  }

  const cacheValue = cache === null || cache[0] === "tombstone" ? null : cache[1];
  const stale = cacheValue !== null && cacheValue !== primaryValue;
  return { cache: cacheValue, stale };
}
