function learning_switch(ports, aging, frames) {
  const vlanOf = new Map(ports.map(([p, v]) => [p, v]));
  const table = new Map(); // "vlan|mac" -> [port, lastSeen]
  const out = [];
  for (const [time, inPort, src, dst] of frames) {
    const vlan = vlanOf.get(inPort);
    table.set(`${vlan}|${src}`, [inPort, time]);
    const flood = ports
      .filter(([p, v]) => v === vlan && p !== inPort)
      .map(([p]) => p)
      .sort((a, b) => a - b);
    if (parseInt(dst.slice(0, 2), 16) & 1) {
      out.push(flood);
      continue;
    }
    const entry = table.get(`${vlan}|${dst}`);
    if (entry !== undefined && time - entry[1] <= aging) {
      out.push(entry[0] === inPort ? [] : [entry[0]]);
    } else {
      out.push(flood);
    }
  }
  return out;
}
