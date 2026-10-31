function resolve_route(routes, dst) {
  const toInt = (ip) => ip.split(".").reduce((acc, x) => acc * 256 + Number(x), 0);
  const table = routes.map(([prefix, hops]) => {
    const [net, lenStr] = prefix.split("/");
    const length = Number(lenStr);
    const size = 2 ** (32 - length);
    const base = Math.floor(toInt(net) / size) * size;
    return { length, base, size, prefix, hops };
  });

  const matches = (ip, allowDefault) => {
    const a = toInt(ip);
    return table
      .filter((r) => Math.floor(a / r.size) * r.size === r.base && (allowDefault || r.length > 0))
      .sort((x, y) => y.length - x.length);
  };

  const isConnected = (r) => r.hops.some((h) => h.startsWith("if:"));

  const expand = (route, chain, out) => {
    for (const hop of route.hops) {
      if (hop.startsWith("if:")) continue;
      const nxt = matches(hop, false);
      if (nxt.length === 0) continue;
      const best = nxt[0];
      if (chain.includes(best.prefix)) continue;
      if (isConnected(best)) out.set(hop + "|" + best.hops[0].slice(3), [hop, best.hops[0].slice(3)]);
      else expand(best, chain.concat([best.prefix]), out);
    }
    return out;
  };

  for (const route of matches(dst, true)) {
    if (isConnected(route)) return [[dst, route.hops[0].slice(3)]];
    const pairs = [...expand(route, [route.prefix], new Map()).values()];
    if (pairs.length > 0) {
      return pairs.sort((x, y) => (x[0] + "|" + x[1] < y[0] + "|" + y[1] ? -1 : x[0] + "|" + x[1] > y[0] + "|" + y[1] ? 1 : 0));
    }
  }
  return [];
}
