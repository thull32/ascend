function lock_order_cycles(traces) {
  const edges = new Map(); // lock -> Set of locks acquired while it was held

  for (const trace of traces) {
    const held = new Map(); // lock -> count currently held by this thread
    for (const [op, lock] of trace) {
      if (op === "lock") {
        for (const [h, count] of held) {
          if (count > 0) {
            if (!edges.has(h)) edges.set(h, new Set());
            edges.get(h).add(lock);
          }
        }
        held.set(lock, (held.get(lock) || 0) + 1);
      } else {
        held.set(lock, (held.get(lock) || 0) - 1);
      }
    }
  }

  const nodes = new Set(edges.keys());
  for (const targets of edges.values()) {
    for (const t of targets) nodes.add(t);
  }

  const onCycle = [];
  for (const start of nodes) {
    const seen = new Set([start]);
    const stack = Array.from(edges.get(start) || []);
    let reached = false;
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === start) {
        reached = true;
        break;
      }
      if (seen.has(node)) continue;
      seen.add(node);
      for (const nxt of edges.get(node) || []) stack.push(nxt);
    }
    if (reached) onCycle.push(start);
  }

  return onCycle.sort();
}
