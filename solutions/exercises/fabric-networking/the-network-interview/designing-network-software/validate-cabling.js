function validate_cabling(planned, lldp) {
  const SUFFIX = ".meridian.example";
  const port = (device, iface) => {
    let d = device.trim().toLowerCase();
    if (d.endsWith(SUFFIX)) d = d.slice(0, -SUFFIX.length);
    return [d, iface.trim().toLowerCase()];
  };
  const cmp = (x, y) => {
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      if (x[i] < y[i]) return -1;
      if (x[i] > y[i]) return 1;
    }
    return x.length - y.length;
  };
  const link = (aDev, aIf, bDev, bIf) => {
    const ends = [port(aDev, aIf), port(bDev, bIf)].sort(cmp);
    return [...ends[0], ...ends[1]];
  };
  const key = (l) => l.join("\u0000");
  const plan = new Map(planned.map((r) => link(...r)).map((l) => [key(l), l]));
  const seen = new Map(lldp.map((r) => link(...r)).map((l) => [key(l), l]));
  const plannedPorts = new Set();
  for (const l of plan.values()) {
    plannedPorts.add(key(l.slice(0, 2)));
    plannedPorts.add(key(l.slice(2)));
  }
  const missing = [...plan.values()].filter((l) => !seen.has(key(l)));
  const unexpected = [...seen.values()].filter((l) => !plan.has(key(l)));
  const touches = (l) => plannedPorts.has(key(l.slice(0, 2))) || plannedPorts.has(key(l.slice(2)));
  return {
    missing: missing.sort(cmp),
    miswired: unexpected.filter(touches).sort(cmp),
    extra: unexpected.filter((l) => !touches(l)).sort(cmp),
  };
}
