function apply_cdc(events) {
  const rows = new Map();
  const versions = new Map();
  let ignored = 0;

  for (const [op, key, value, version] of events) {
    const last = versions.has(key) ? versions.get(key) : null;
    if (last !== null && version <= last) {
      ignored += 1;
      continue;
    }
    versions.set(key, version);
    if (op === "d") {
      rows.delete(key);
    } else {
      rows.set(key, value);
    }
  }

  const keys = [...rows.keys()].sort();
  return { rows: keys.map((k) => [k, rows.get(k)]), ignored };
}
