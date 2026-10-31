// Pick BGP's best path with the decision process, set-wise, and name the step that decided.

const ORIGIN_RANK = { IGP: 0, EGP: 1, INCOMPLETE: 2 };

function best_path(paths, always_compare_med) {
  const rid = (p) => p.router_id.split(".").reduce((acc, x) => acc * 256 + Number(x), 0);
  const med = (p) => (p.med === undefined || p.med === null ? 0 : p.med);
  const keep = (alive, key, highest) => {
    const values = alive.map(key);
    const target = highest ? Math.max(...values) : Math.min(...values);
    return alive.filter((p) => key(p) === target);
  };
  const medStep = (alive) => {
    const groups = new Map();
    for (const p of alive) {
      const g = always_compare_med ? "all" : p.as_path.length ? p.as_path[0] : 0;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    const kept = new Set();
    for (const group of groups.values()) {
      const low = Math.min(...group.map(med));
      for (const p of group) if (med(p) === low) kept.add(p);
    }
    return alive.filter((p) => kept.has(p));
  };
  const steps = [
    ["weight", (a) => keep(a, (p) => p.weight ?? 0, true)],
    ["local_pref", (a) => keep(a, (p) => p.local_pref ?? 100, true)],
    ["locally_originated", (a) => keep(a, (p) => (p.local ? 1 : 0), true)],
    ["as_path", (a) => keep(a, (p) => p.as_path.length, false)],
    ["origin", (a) => keep(a, (p) => ORIGIN_RANK[p.origin], false)],
    ["med", medStep],
    ["ebgp", (a) => keep(a, (p) => (p.ebgp ? 1 : 0), true)],
    ["igp_cost", (a) => keep(a, (p) => p.igp_cost, false)],
    ["router_id", (a) => keep(a, rid, false)],
  ];
  let alive = [...paths];
  if (alive.length === 1) return [alive[0].id, "only_path"];
  for (const [name, step] of steps) {
    alive = step(alive);
    if (alive.length === 1) return [alive[0].id, name];
  }
  return [alive[0].id, "router_id"];
}
