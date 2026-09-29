function redlock(n, ttl, events) {
  const majority = Math.floor(n / 2) + 1;
  const drift = Math.floor(ttl / 100) + 2;
  const offset = new Array(n).fill(0);
  const owner = new Array(n).fill(null);
  const expiry = new Array(n).fill(0);
  const believes = new Map();
  const out = [];

  for (const ev of events) {
    const kind = ev[0];
    if (kind === "acquire") {
      const client = ev[1], t = ev[2], reachable = ev[3];
      const acquiredNodes = [];
      for (const node of reachable) {
        const nodeClock = t + offset[node];
        if (owner[node] === null || nodeClock >= expiry[node]) {
          owner[node] = client;
          expiry[node] = nodeClock + ttl;
          acquiredNodes.push(node);
        }
      }

      let ok;
      if (acquiredNodes.length >= majority) {
        believes.set(client, t + ttl - drift);
        ok = true;
      } else {
        for (const node of acquiredNodes) owner[node] = null;
        ok = false;
      }

      const alsoHolding = [...believes.entries()]
        .filter(([c, until]) => c !== client && until > t)
        .map(([c]) => c)
        .sort();

      out.push({ ok, also_holding: alsoHolding });
    } else if (kind === "jump") {
      const node = ev[1], delta = ev[2];
      offset[node] += delta;
    } else if (kind === "restart") {
      const node = ev[1];
      owner[node] = null;
    } else if (kind === "release") {
      const client = ev[1];
      for (let node = 0; node < n; node++) {
        if (owner[node] === client) owner[node] = null;
      }
      believes.delete(client);
    }
  }

  return out;
}
