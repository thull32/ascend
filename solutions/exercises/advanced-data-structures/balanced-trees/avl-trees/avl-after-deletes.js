class Node {
  constructor(key) {
    this.key = key;
    this.left = null;
    this.right = null;
    this.height = 1;
  }
}

function height(n) {
  return n ? n.height : 0;
}

function updateHeight(n) {
  n.height = 1 + Math.max(height(n.left), height(n.right));
}

function balanceFactor(n) {
  return height(n.left) - height(n.right);
}

function rotateRight(y) {
  const x = y.left;
  y.left = x.right;
  x.right = y;
  updateHeight(y);
  updateHeight(x);
  return x;
}

function rotateLeft(x) {
  const y = x.right;
  x.right = y.left;
  y.left = x;
  updateHeight(x);
  updateHeight(y);
  return y;
}

function rebalance(node) {
  updateHeight(node);
  const bf = balanceFactor(node);
  if (bf > 1) {
    if (balanceFactor(node.left) < 0) node.left = rotateLeft(node.left);
    return rotateRight(node);
  }
  if (bf < -1) {
    if (balanceFactor(node.right) > 0) node.right = rotateRight(node.right);
    return rotateLeft(node);
  }
  return node;
}

function insert(node, key) {
  if (node === null) return new Node(key);
  if (key < node.key) node.left = insert(node.left, key);
  else node.right = insert(node.right, key);
  return rebalance(node);
}

function del(node, key) {
  if (node === null) return null;
  if (key < node.key) {
    node.left = del(node.left, key);
  } else if (key > node.key) {
    node.right = del(node.right, key);
  } else {
    if (node.left === null || node.right === null) return node.left || node.right;
    let succ = node.right;
    while (succ.left) succ = succ.left;
    node.key = succ.key;
    node.right = del(node.right, succ.key);
  }
  return rebalance(node);
}

function avl_after_deletes(inserts, deletes) {
  let root = null;
  for (const v of inserts) root = insert(root, v);
  for (const v of deletes) root = del(root, v);
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
