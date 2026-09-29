function pat_simulate(public_ip, mode, events) {
  const out = [];

  // mapping key (string) -> external port
  const keyToPort = new Map();
  // external_port -> { inside: [ip, port], dests: Set of "ip:port" }
  const portTable = new Map();
  const usedPorts = new Set();

  function mappingKey(ip, port, dstIp, dstPort) {
    if (mode === "symmetric") {
      return `${ip}:${port}:${dstIp}:${dstPort}`;
    }
    return `${ip}:${port}`;
  }

  for (const event of events) {
    if (event[0] === "out") {
      const [, ip, port, dstIp, dstPort] = event;
      const key = mappingKey(ip, port, dstIp, dstPort);

      let extPort;
      if (keyToPort.has(key)) {
        extPort = keyToPort.get(key);
      } else {
        let candidate = port;
        while (usedPorts.has(candidate)) candidate += 1;
        extPort = candidate;
        keyToPort.set(key, extPort);
        usedPorts.add(extPort);
        portTable.set(extPort, { inside: [ip, port], dests: new Set() });
      }

      portTable.get(extPort).dests.add(`${dstIp}:${dstPort}`);
      out.push(`${public_ip}:${extPort}`);
    } else if (event[0] === "in") {
      const [, srcIp, srcPort, extPort] = event;
      const entry = portTable.get(extPort);
      if (entry && entry.dests.has(`${srcIp}:${srcPort}`)) {
        const [insideIp, insidePort] = entry.inside;
        out.push(`${insideIp}:${insidePort}`);
      } else {
        out.push("drop");
      }
    }
  }

  return out;
}
