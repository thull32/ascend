class Node {
  constructor(key, prio) {
    this.key = key;
    this.prio = prio;
    this.left = this.right = null;
  }
}

function rotateRight(node) {
  const left = node.left;
  node.left = left.right;
  left.right = node;
  return left;
}

function rotateLeft(node) {
  const right = node.right;
  node.right = right.left;
  right.left = node;
  return right;
}

function insert(node, key, prio) {
  if (node === null) return new Node(key, prio);
  if (key < node.key) {
    node.left = insert(node.left, key, prio);
    if (node.left.prio > node.prio) node = rotateRight(node);
  } else {
    node.right = insert(node.right, key, prio);
    if (node.right.prio > node.prio) node = rotateLeft(node);
  }
  return node;
}

function treap_level_order(items) {
  let root = null;
  for (const [key, prio] of items) root = insert(root, key, prio);
  const order = [];
  if (root) {
    const q = [root];
    while (q.length) {
      const n = q.shift();
      order.push(n.key);
      if (n.left) q.push(n.left);
      if (n.right) q.push(n.right);
    }
  }
  return order;
}
