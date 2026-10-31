// Walk both trees together with an explicit stack. At each level the keys
// only in running are added, only in intended removed; a key in both
// descends only when both values are objects, otherwise the two values are
// compared strictly (types, list order) and a difference is a change.
function config_drift(intended, running) {
  const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  const same = (a, b) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
    }
    if (isObject(a) || isObject(b)) {
      if (!isObject(a) || !isObject(b)) return false;
      const ka = Object.keys(a);
      return ka.length === Object.keys(b).length && ka.every((k) => has(b, k) && same(a[k], b[k]));
    }
    return a === b; // strict: 9216 !== "9216", true !== 1, null === null
  };

  const added = [];
  const removed = [];
  const changed = [];
  const stack = [["", intended, running]];
  while (stack.length > 0) {
    const [prefix, want, have] = stack.pop();
    const keys = new Set([...Object.keys(want), ...Object.keys(have)]);
    for (const key of keys) {
      const path = prefix + key;
      if (!has(have, key)) removed.push(path); // a missing subtree: once, at its root
      else if (!has(want, key)) added.push(path);
      else if (isObject(want[key]) && isObject(have[key])) stack.push([path + ".", want[key], have[key]]);
      else if (!same(want[key], have[key])) changed.push(path); // includes object vs scalar
    }
  }
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}
