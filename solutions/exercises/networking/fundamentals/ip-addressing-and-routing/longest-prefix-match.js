function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  let value = 0;
  for (const p of parts) value = value * 256 + p;
  return value;
}

function longest_prefix_match(routes, dst) {
  const dstInt = ipToInt(dst);

  let bestHop = null;
  let bestPrefix = -1;

  for (const [cidr, nextHop] of routes) {
    const [addr, prefixStr] = cidr.split("/");
    const prefix = parseInt(prefixStr, 10);
    const addrInt = ipToInt(addr);

    const divisor = 2 ** (32 - prefix);
    const network = Math.floor(addrInt / divisor) * divisor;
    const dstMasked = Math.floor(dstInt / divisor) * divisor;
    if (network !== dstMasked) continue;

    if (prefix > bestPrefix) {
      bestPrefix = prefix;
      bestHop = nextHop;
    }
  }

  return bestHop;
}
