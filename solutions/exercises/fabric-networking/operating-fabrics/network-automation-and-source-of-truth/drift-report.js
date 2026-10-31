// Diff intended against running configuration as flat {path: value} trees: set what differs,
// delete what the device has beyond the intent, but only inside the sections this tool owns.

function drift_report(intended, running, managed) {
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  // a managed prefix owns itself and everything below it, on "/" boundaries only
  const owned = (path) => managed.some((m) => path === m || path.startsWith(m + "/"));
  const deletes = Object.keys(running)
    .sort()
    .filter((p) => !has(intended, p) && owned(p))
    .map((p) => ["delete", p, running[p]]);
  const sets = Object.keys(intended)
    .sort()
    .filter((p) => !has(running, p) || running[p] !== intended[p])
    .map((p) => ["set", p, intended[p]]);
  return deletes.concat(sets);
}
