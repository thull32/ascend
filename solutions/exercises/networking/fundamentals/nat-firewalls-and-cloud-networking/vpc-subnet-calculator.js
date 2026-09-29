function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  let value = 0;
  for (const p of parts) value = value * 256 + p;
  return value;
}

function intToIp(value) {
  return [24, 16, 8, 0]
    .map((shift) => Math.floor(value / 2 ** shift) % 256)
    .join(".");
}

function split_cidr(cidr, new_prefix, count) {
  const [addr, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);

  if (new_prefix < prefix || new_prefix > 28) {
    return [];
  }

  const addrInt = ipToInt(addr);
  const blockSize = 2 ** (32 - prefix);
  const network = Math.floor(addrInt / blockSize) * blockSize;

  const subnetSize = 2 ** (32 - new_prefix);
  const totalSubnets = blockSize / subnetSize;
  const n = Math.min(count, totalSubnets);

  const result = [];
  for (let i = 0; i < n; i++) {
    const base = network + i * subnetSize;
    const subnetCidr = `${intToIp(base)}/${new_prefix}`;
    const firstUsable = intToIp(base + 4);
    const lastUsable = intToIp(base + subnetSize - 2);
    const usableCount = subnetSize - 5;
    result.push([subnetCidr, firstUsable, lastUsable, usableCount]);
  }

  return result;
}
