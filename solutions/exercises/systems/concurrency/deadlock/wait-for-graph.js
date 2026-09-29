function deadlocked_threads(holds, waits) {
  const holder = new Map();
  for (const [thread, lock] of holds) holder.set(lock, thread);

  const nxt = new Map();
  for (const [thread, lock] of waits) {
    if (holder.has(lock)) nxt.set(thread, holder.get(lock));
  }

  const done = new Set();
  const result = new Set();

  for (const start of nxt.keys()) {
    if (done.has(start)) continue;
    const path = [];
    let node = start;
    while (true) {
      if (!nxt.has(node) || done.has(node)) {
        for (const n of path) done.add(n);
        break;
      }
      const idx = path.indexOf(node);
      if (idx !== -1) {
        for (let i = idx; i < path.length; i++) result.add(path[i]);
        for (const n of path) done.add(n);
        break;
      }
      path.push(node);
      node = nxt.get(node);
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}
