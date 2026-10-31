// Parse to unsigned 32-bit integers, mask the top L bits, compare networks.
// JavaScript shifts are signed and take the count mod 32, so normalise with
// >>> 0 and special-case /0 (whose mask must be 0, not all ones).
function _ipv4ToInt(s) {
  const [a, b, c, d] = s.split(".").map(Number);
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function ip_in_subnet(cidr, addresses) {
  const [block, lenStr] = cidr.split("/");
  const len = Number(lenStr);
  const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
  const network = (_ipv4ToInt(block) & mask) >>> 0;
  return addresses.map((addr) => ((_ipv4ToInt(addr) & mask) >>> 0) === network);
}
