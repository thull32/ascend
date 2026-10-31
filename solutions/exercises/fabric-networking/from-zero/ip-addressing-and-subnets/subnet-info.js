// Network, broadcast, host range and usable count for an IPv4 CIDR, with /31 and /32 rules.

function subnet_info(cidr) {
  const [addr, plenText] = cidr.split("/");
  const plen = parseInt(plenText, 10);
  let a = 0;
  for (const octet of addr.split(".")) {
    a = a * 256 + parseInt(octet, 10);
  }
  // JavaScript shifts are mod 32, so build the mask without shifting by 32.
  const mask = plen === 0 ? 0 : (0xffffffff << (32 - plen)) >>> 0;
  const net = (a & mask) >>> 0;
  const last = (net | (~mask >>> 0)) >>> 0;
  const dotted = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 0xff).join(".");

  if (plen === 32) {
    return { network: dotted(net), broadcast: null, first: dotted(net), last: dotted(net), hosts: 1 };
  }
  if (plen === 31) {
    return { network: dotted(net), broadcast: null, first: dotted(net), last: dotted(last), hosts: 2 };
  }
  return {
    network: dotted(net),
    broadcast: dotted(last),
    first: dotted(net + 1),
    last: dotted(last - 1),
    hosts: 2 ** (32 - plen) - 2,
  };
}
