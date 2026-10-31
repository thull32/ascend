// Binary trie over address bits: one level per bit, next hop stored where a
// prefix ends. A lookup walks the destination's bits and keeps the deepest
// next hop it passes.
function longest_prefix_match(routes, destinations) {
  const toInt = (addr) =>
    addr.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
  const newNode = () => ({ child: [null, null], nextHop: null });

  const root = newNode();
  for (const [prefix, nextHop] of routes) {
    const [addr, lenText] = prefix.split("/");
    const value = toInt(addr);
    const length = Number(lenText);
    let node = root;
    for (let i = 0; i < length; i++) {
      const bit = (value >>> (31 - i)) & 1; // only the first L bits matter
      if (node.child[bit] === null) node.child[bit] = newNode();
      node = node.child[bit];
    }
    node.nextHop = nextHop; // a repeated prefix overwrites
  }

  const answers = [];
  for (const dst of destinations) {
    const value = toInt(dst);
    let node = root;
    let best = root.nextHop; // the /0 default route, if any
    for (let i = 0; i < 32; i++) {
      node = node.child[(value >>> (31 - i)) & 1];
      if (node === null) break; // fell off the trie
      if (node.nextHop !== null) best = node.nextHop;
    }
    answers.push(best);
  }
  return answers;
}
