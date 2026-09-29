function fenced_store(ops) {
  const value = new Map();
  const highest = new Map();
  const out = [];

  for (const op of ops) {
    const kind = op[0], key = op[1], token = op[2];
    const h = highest.has(key) ? highest.get(key) : 0;
    if (kind === "write") {
      const val = op[3];
      if (token >= h) {
        value.set(key, val);
        highest.set(key, token);
        out.push("ok");
      } else {
        out.push("rejected");
      }
    } else {
      if (token >= h) {
        highest.set(key, token);
        out.push(value.has(key) ? value.get(key) : null);
      } else {
        out.push("rejected");
      }
    }
  }

  return out;
}
