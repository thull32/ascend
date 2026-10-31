// Set-wise elimination ladder. Every step keeps the routes that tie for the
// best value of one attribute. MED is the one step that is not a total order:
// each neighbouring AS keeps its own lowest MED, and routes from different
// neighbouring ASes never eliminate each other there. After MED the remaining
// steps are a plain lexicographic minimum, with the lower index breaking a
// full tie.
function bgp_best_path(routes) {
  const ORIGIN_RANK = { IGP: 0, EGP: 1, INCOMPLETE: 2 };
  const med = (r) => (r.med === null || r.med === undefined ? 0 : r.med);
  const routerId = (text) =>
    text.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);

  let alive = routes.map((route, index) => ({ route, index }));
  const keepLowest = (key) => {
    let best = Infinity;
    for (const c of alive) best = Math.min(best, key(c.route));
    alive = alive.filter((c) => key(c.route) === best);
  };

  keepLowest((r) => -r.local_pref); // 1. highest LOCAL_PREF
  keepLowest((r) => r.as_path.length); // 2. shortest AS_PATH
  keepLowest((r) => ORIGIN_RANK[r.origin]); // 3. IGP < EGP < INCOMPLETE

  // 4. lowest MED, within each neighbouring AS among the survivors only
  const lowest = new Map();
  for (const { route } of alive) {
    const m = med(route);
    const prev = lowest.get(route.neighbor_as);
    if (prev === undefined || m < prev) lowest.set(route.neighbor_as, m);
  }
  alive = alive.filter(({ route }) => med(route) === lowest.get(route.neighbor_as));

  keepLowest((r) => (r.ebgp ? 0 : 1)); // 5. eBGP over iBGP
  keepLowest((r) => r.igp_cost); // 6. lowest IGP cost to the next hop
  keepLowest((r) => routerId(r.router_id)); // 7. lowest router ID, as a number

  return alive[0].index; // filter keeps input order, so this is the lowest index
}
