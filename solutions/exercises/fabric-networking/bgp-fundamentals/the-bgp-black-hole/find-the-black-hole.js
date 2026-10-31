function walk_packet(fibs, loopbacks, start, dst, ttl) {
  const toInt = (ip) => ip.split(".").reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
  const lookup = (router, addr) => {
    const x = toInt(addr);
    let best = null;
    for (const [prefix, action] of fibs[router]) {
      const [net, lenText] = prefix.split("/");
      const length = Number(lenText);
      const mask = length === 0 ? 0 : (0xffffffff << (32 - length)) >>> 0;
      if (((x & mask) >>> 0) === ((toInt(net) & mask) >>> 0) && (best === null || length > best[0])) {
        best = [length, action];
      }
    }
    return best;
  };
  let router = start;
  const stack = [dst];
  const path = [start];
  while (true) {
    const match = lookup(router, stack[stack.length - 1]);
    if (match === null) return { path, outcome: `no route at ${router}` };
    const action = match[1];
    if (action === "local") {
      if (stack.length === 1) return { path, outcome: `delivered at ${router}` };
      stack.pop();
      continue;
    }
    if (action.startsWith("vxlan:")) {
      stack.push(loopbacks[action.slice("vxlan:".length)]);
      continue;
    }
    if (ttl === 0) return { path, outcome: `ttl expired at ${router}` };
    ttl -= 1;
    router = action;
    path.push(router);
  }
}
