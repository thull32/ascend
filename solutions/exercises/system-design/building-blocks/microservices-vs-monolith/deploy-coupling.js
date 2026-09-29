function coupling(access) {
  const tableServices = new Map();
  const tableWriters = new Map();
  const services = new Set();

  for (const [service, table, mode] of access) {
    services.add(service);
    if (!tableServices.has(table)) tableServices.set(table, new Set());
    tableServices.get(table).add(service);
    if (mode === "w") {
      if (!tableWriters.has(table)) tableWriters.set(table, new Set());
      tableWriters.get(table).add(service);
    }
  }

  const multi_writer = [...tableWriters.entries()]
    .filter(([, s]) => s.size >= 2)
    .map(([t]) => t)
    .sort();

  const parent = new Map();
  for (const s of services) parent.set(s, s);

  function find(x) {
    while (parent.get(x) !== x) x = parent.get(x);
    return x;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const svcSet of tableServices.values()) {
    const svcs = [...svcSet];
    for (let i = 1; i < svcs.length; i++) union(svcs[0], svcs[i]);
  }

  const groups = new Map();
  for (const s of services) {
    const r = find(s);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(s);
  }

  const lockstep_groups = [...groups.values()]
    .filter(g => g.length >= 2)
    .map(g => g.slice().sort())
    .sort((a, b) => {
      const la = a.join(","), lb = b.join(",");
      return la < lb ? -1 : la > lb ? 1 : 0;
    });

  return { multi_writer, lockstep_groups };
}
