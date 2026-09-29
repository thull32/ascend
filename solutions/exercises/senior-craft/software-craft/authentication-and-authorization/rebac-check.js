function check(schema, tuples, obj, relation, user) {
  const index = new Map();
  for (const [o, r, s] of tuples) {
    const key = o + "\u0000" + r;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(s);
  }

  const visiting = new Set();

  function has(o, r) {
    const key = o + "\u0000" + r;
    if (visiting.has(key)) return false;
    visiting.add(key);
    try {
      const objType = o.split(":")[0];
      const rules = (schema[objType] && schema[objType][r]) || ["this"];
      for (const rule of rules) {
        if (rule === "this") {
          for (const s of index.get(key) || []) {
            if (s === user) return true;
            if (s.includes("#")) {
              const [so, sr] = s.split("#");
              if (has(so, sr)) return true;
            }
          }
        } else if (rule[0] === "computed") {
          if (has(o, rule[1])) return true;
        } else if (rule[0] === "from") {
          const [, link, r2] = rule;
          for (const other of index.get(o + "\u0000" + link) || []) {
            if (has(other, r2)) return true;
          }
        }
      }
      return false;
    } finally {
      visiting.delete(key);
    }
  }

  return has(obj, relation);
}
