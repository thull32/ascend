function circuits_at_risk(circuits, demand) {
  const pair = (a, b) => [a, b].sort().join("|");
  const need = new Map(demand.map(([a, b, gbps]) => [pair(a, b), gbps]));
  const atRisk = [];
  circuits.forEach((failed, i) => {
    const survivors = new Map();
    circuits.forEach((c, j) => {
      if (j === i) return;
      const p = pair(c[1], c[2]);
      if (!survivors.has(p)) survivors.set(p, []);
      survivors.get(p).push(c);
    });
    let broken = false;
    for (const [p, gbps] of need) {
      if (gbps <= 0) continue;
      const up = survivors.get(p) || [];
      if (up.length === 0) { broken = true; break; }
      const share = gbps / up.length;
      if (up.some((c) => share > c[3])) { broken = true; break; }
    }
    if (broken) atRisk.push(failed[0]);
  });
  return atRisk;
}
