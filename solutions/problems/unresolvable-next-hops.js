// One BFS from the router over up links gives every reachable router; a prefix is
// unresolvable when none of its paths' next hops is the loopback of a reached router.
function unresolvable_next_hops(router, loopbacks, links, routes) {
  const adjacency = new Map();
  for (const [a, b, state] of links) {
    if (state !== "up") continue; // a down link is not an IGP adjacency
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }

  const reached = new Set([router]); // a router always reaches its own loopback
  const queue = [router];
  for (let head = 0; head < queue.length; head++) {
    for (const neighbour of adjacency.get(queue[head]) || []) {
      if (!reached.has(neighbour)) {
        reached.add(neighbour);
        queue.push(neighbour);
      }
    }
  }

  const owner = new Map();
  for (const [name, address] of loopbacks) owner.set(address, name);

  const resolves = new Map(); // insertion order = first appearance
  for (const [prefix, nextHop] of routes) {
    if (!resolves.has(prefix)) resolves.set(prefix, false);
    if (owner.has(nextHop) && reached.has(owner.get(nextHop))) resolves.set(prefix, true);
  }
  const out = [];
  for (const [prefix, ok] of resolves) if (!ok) out.push(prefix);
  return out;
}
