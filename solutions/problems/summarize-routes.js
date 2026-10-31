// Sort blocks by (network, length), then sweep with a stack of disjoint
// blocks: skip a block inside the top, otherwise push it and merge the top
// two while they are siblings (merges cascade upwards).
function summarize_routes(prefixes) {
  const toInt = (addr) =>
    addr.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
  const toStr = (value) =>
    [2 ** 24, 2 ** 16, 2 ** 8, 1]
      .map((unit) => Math.floor(value / unit) % 256)
      .join(".");

  const blocks = prefixes.map((prefix) => {
    const [addr, lenText] = prefix.split("/");
    const length = Number(lenText);
    const size = 2 ** (32 - length); // not 1 << (32 - length): JS shifts are mod 32
    return [Math.floor(toInt(addr) / size) * size, length]; // clear host bits
  });
  blocks.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

  const stack = [];
  for (const [net, length] of blocks) {
    if (stack.length > 0) {
      const [topNet, topLen] = stack[stack.length - 1];
      if (net < topNet + 2 ** (32 - topLen)) continue; // covered by the top
    }
    stack.push([net, length]);
    while (stack.length >= 2) {
      const [aNet, aLen] = stack[stack.length - 2];
      const [bNet, bLen] = stack[stack.length - 1];
      const size = 2 ** (32 - aLen);
      if (aLen !== bLen || aLen === 0 || aNet % (2 * size) !== 0 || bNet !== aNet + size) break;
      stack.pop();
      stack[stack.length - 1] = [aNet, aLen - 1];
    }
  }
  return stack.map(([net, length]) => `${toStr(net)}/${length}`);
}
