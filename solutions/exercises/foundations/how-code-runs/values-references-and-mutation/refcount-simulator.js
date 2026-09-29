function refcount_trace(ops) {
  const names = new Map();
  const counts = new Map();
  const freed = [];
  let nextId = 0;

  for (const op of ops) {
    const kind = op[0];
    if (kind === "assign") {
      const name = op[1];
      const src = op[2];
      let obj;
      if (src === "new") {
        nextId += 1;
        obj = nextId;
        counts.set(obj, 1);
      } else {
        obj = names.get(src);
        counts.set(obj, (counts.get(obj) || 0) + 1);
      }
      const old = names.has(name) ? names.get(name) : null;
      names.set(name, obj);
      if (old !== null) {
        counts.set(old, counts.get(old) - 1);
        if (counts.get(old) === 0) freed.push(old);
      }
    } else if (kind === "del") {
      const name = op[1];
      const old = names.get(name);
      names.delete(name);
      counts.set(old, counts.get(old) - 1);
      if (counts.get(old) === 0) freed.push(old);
    }
  }
  return freed;
}
