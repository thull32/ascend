// O(1) extra space: weave each copy right after its original so "the copy
// of X" is X.next, link randoms, then unweave both lists apart.
class RandomNode {
  constructor(val, next = null, random = null) {
    this.val = val;
    this.next = next;
    this.random = random;
  }
}

function copy_list(head) {
  if (head === null) return null;
  // 1. Weave: A -> A' -> B -> B' -> ...
  let node = head;
  while (node) {
    node.next = new RandomNode(node.val, node.next);
    node = node.next.next;
  }
  // 2. Link randoms: the copy of X.random is X.random.next.
  node = head;
  while (node) {
    if (node.random !== null) node.next.random = node.random.next;
    node = node.next.next;
  }
  // 3. Unweave: restore the original next pointers and thread the copies.
  const copyHead = head.next;
  node = head;
  while (node) {
    const copy = node.next;
    node.next = copy.next;
    copy.next = copy.next ? copy.next.next : null;
    node = node.next;
  }
  return copyHead;
}

// ---- Test harness (provided; no need to change anything below) ----
// Tests pass the list as [[val, randomIndex or null], ...]. The entry
// point builds real nodes, calls copy_list, checks the copy shares no
// node with the original and the original is intact, then encodes the
// copy the same way.

function build(nodes) {
  const made = nodes.map(([val]) => new RandomNode(val));
  nodes.forEach(([, r], i) => {
    if (i + 1 < made.length) made[i].next = made[i + 1];
    if (r !== null) made[i].random = made[r];
  });
  return made.length ? made[0] : null;
}

function serialise(head) {
  const order = [];
  const index = new Map();
  for (let node = head; node && !index.has(node); node = node.next) {
    index.set(node, order.length);
    order.push(node);
  }
  return order.map((n) => [
    n.val,
    n.random == null ? null : index.has(n.random) ? index.get(n.random) : -1,
  ]);
}

function copy_random_list(nodes) {
  const original = build(nodes);
  const originals = new Set();
  for (let node = original; node; node = node.next) originals.add(node);
  const copied = copy_list(original);
  if (JSON.stringify(serialise(original)) !== JSON.stringify(nodes)) {
    return "error: the original list was modified";
  }
  let steps = 0;
  for (let node = copied; node && steps <= nodes.length; node = node.next, steps++) {
    if (originals.has(node) || (node.random && originals.has(node.random))) {
      return "error: the copy shares nodes with the original";
    }
  }
  return serialise(copied);
}
