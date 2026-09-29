function compact_changelog(events, retain_tombstones) {
  const lastIndex = new Map();
  events.forEach(([key], i) => lastIndex.set(key, i));

  const log = [];
  events.forEach(([key, value], i) => {
    if (lastIndex.get(key) !== i) return;
    if (value === null && !retain_tombstones) return;
    log.push([key, value]);
  });

  const table = log
    .filter(([, v]) => v !== null)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  return { log, table };
}
