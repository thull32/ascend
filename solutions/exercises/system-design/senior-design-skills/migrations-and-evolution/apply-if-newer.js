function apply_changes(events) {
  const store = new Map(); // key -> [version, value]
  const skipped = { cdc: 0, backfill: 0 };

  for (const [source, key, version, value] of events) {
    if (store.has(key) && version <= store.get(key)[0]) {
      skipped[source] += 1;
      continue;
    }
    store.set(key, [version, value]);
  }

  const rows = [...store.entries()]
    .filter(([, [, value]]) => value !== null)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, [, value]]) => [key, value]);

  return { rows, skipped };
}
